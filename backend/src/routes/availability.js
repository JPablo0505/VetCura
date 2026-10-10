const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = ['admin', 'vet', 'staff'];
// Weekday convention: 0 = Sunday … 6 = Saturday (JS getUTCDay).
// Slot math runs in UTC for determinism; clients render locally.

const rangeSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
});

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function getVet(db, id) {
  return db.prepare("SELECT id, display_name FROM users WHERE id = ? AND role IN ('vet','admin')").get(id);
}

function windowsFor(db, vetId, weekday) {
  return db
    .prepare('SELECT id, start_min, end_min FROM vet_availability WHERE vet_user_id = ? AND weekday = ? ORDER BY start_min')
    .all(vetId, weekday);
}

function bookedRanges(db, vetId, dayStart, dayEnd) {
  return db
    .prepare(
      `SELECT starts_at, ends_at FROM appointments
       WHERE vet_user_id = ? AND status NOT IN ('cancelled','no_show')
         AND datetime(starts_at) < datetime(?) AND datetime(ends_at) > datetime(?)`,
    )
    .all(vetId, dayEnd.toISOString(), dayStart.toISOString());
}

function rangeToMs(iso) {
  return new Date(iso).getTime();
}

function computeSlots(windows, booked, dayStart, slotMin, nowMs) {
  const slots = [];
  for (const w of windows) {
    const base = Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate());
    for (let s = w.start_min; s + slotMin <= w.end_min; s += slotMin) {
      const startMs = base + s * 60000;
      const endMs = startMs + slotMin * 60000;
      if (startMs <= nowMs) continue; // past times are never bookable
      const clash = booked.some((b) => startMs < rangeToMs(b.ends_at) && endMs > rangeToMs(b.starts_at));
      if (!clash) {
        slots.push({ starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() });
      }
    }
  }
  return slots;
}

// Shared by the slots endpoint and the booking guard: is [start,end)
// fully inside one availability window of this vet?
function coveredByAvailability(db, vetId, startsAt, endsAt) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth() || start.getUTCDate() !== end.getUTCDate()) {
    return false; // single-day appointments only when a vet is assigned
  }
  const dayStartMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const sMin = Math.floor((start.getTime() - dayStartMs) / 60000);
  const eMin = Math.ceil((end.getTime() - dayStartMs) / 60000);
  return windowsFor(db, vetId, start.getUTCDay()).some((w) => w.start_min <= sMin && w.end_min >= eMin);
}

function allWindows(db, vetId) {
  return db
    .prepare('SELECT id, weekday, start_min, end_min FROM vet_availability WHERE vet_user_id = ? ORDER BY weekday, start_min')
    .all(vetId);
}

function buildAvailabilityRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/vets/:id/availability', requireRole(...STAFF), (req, res, next) => {
    try {
      const vet = getVet(db, Number(req.params.id));
      if (!vet) throw apiError('not_found', 'Veterinarian not found', 404);
      res.json({ vet, availability: allWindows(db, vet.id) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/vets/:id/availability', requireRole('admin', 'staff'), (req, res, next) => {
    try {
      const vet = getVet(db, Number(req.params.id));
      if (!vet) throw apiError('not_found', 'Veterinarian not found', 404);
      const body = validate(rangeSchema, req.body);
      const startMin = toMinutes(body.start);
      const endMin = toMinutes(body.end);
      if (endMin <= startMin) throw apiError('validation_error', 'end must be after start', 400);
      try {
        const created = db
          .prepare('INSERT INTO vet_availability (vet_user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)')
          .run(vet.id, body.weekday, startMin, endMin);
        res.status(201).json({
          availability: { id: Number(created.lastInsertRowid), vet_user_id: vet.id, weekday: body.weekday, start_min: startMin, end_min: endMin },
        });
      } catch (e) {
        if (e && e.code === 'ERR_SQLITE_ERROR' && /UNIQUE/i.test(e.message)) {
          throw apiError('conflict', 'An overlapping range start already exists for that day', 409);
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  });

  router.delete('/availability/:id', requireRole('admin', 'staff'), (req, res, next) => {
    try {
      const gone = db.prepare('DELETE FROM vet_availability WHERE id = ?').run(Number(req.params.id));
      if (gone.changes === 0) throw apiError('not_found', 'Availability range not found', 404);
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/vets/:id/slots', (req, res, next) => {
    try {
      const vet = getVet(db, Number(req.params.id));
      if (!vet) throw apiError('not_found', 'Veterinarian not found', 404);
      const date = String(req.query.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw apiError('validation_error', 'date must be YYYY-MM-DD', 400);
      }
      const slotMin = Math.min(240, Math.max(15, Number(req.query.slot_min || 30)));
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 864e5);
      const windows = windowsFor(db, vet.id, dayStart.getUTCDay());
      const booked = bookedRanges(db, vet.id, dayStart, dayEnd);
      const slots = computeSlots(windows, booked, dayStart, slotMin, Date.now());
      res.json({ vet_id: vet.id, date, slot_min: slotMin, slots });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAvailabilityRoutes, coveredByAvailability, toMinutes };
