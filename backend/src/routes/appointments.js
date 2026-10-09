const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { petVisibleTo } = require('./owners-pets');

const STAFF = ['admin', 'vet', 'staff'];
const STATUS = ['scheduled', 'checked_in', 'done', 'cancelled', 'no_show'];
const TRANSITIONS = {
  scheduled: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['done', 'cancelled', 'no_show'],
  done: [],
  cancelled: [],
  no_show: [],
};

const appointmentSchema = z.object({
  pet_id: z.number().int().positive(),
  vet_user_id: z.number().int().positive().nullable().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  reason: z.string().max(500).nullable().optional(),
});

function buildAppointmentRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  function scopedList(user, { from, to } = {}) {
    let sql = `SELECT a.*, p.name AS pet_name, p.owner_id FROM appointments a
               JOIN pets p ON p.id = a.pet_id WHERE 1=1`;
    const params = [];
    if (user.role === 'owner') {
      sql += ' AND p.owner_id = ?';
      params.push(user.sub);
    }
    if (from) {
      sql += ' AND datetime(a.starts_at) >= datetime(?)';
      params.push(from);
    }
    if (to) {
      sql += ' AND datetime(a.starts_at) < datetime(?)';
      params.push(to);
    }
    sql += ' ORDER BY a.starts_at';
    return db.prepare(sql).all(...params);
  }

  router.get('/appointments', (req, res, next) => {
    try {
      res.json({ appointments: scopedList(req.user, req.query) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/appointments', (req, res, next) => {
    try {
      const body = validate(appointmentSchema, req.body);
      if (new Date(body.ends_at) <= new Date(body.starts_at)) {
        throw apiError('validation_error', 'ends_at must be after starts_at', 400);
      }
      const pet = petVisibleTo(db, body.pet_id, req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      if (body.vet_user_id) {
        const vet = db
          .prepare("SELECT id FROM users WHERE id = ? AND role IN ('vet','admin')")
          .get(body.vet_user_id);
        if (!vet) throw apiError('not_found', 'Veterinarian not found', 404);
        const clash = db
          .prepare(
            `SELECT id FROM appointments
             WHERE vet_user_id = ? AND status NOT IN ('cancelled','no_show')
               AND datetime(?) < datetime(ends_at) AND datetime(?) > datetime(starts_at)`,
          )
          .get(body.vet_user_id, body.starts_at, body.ends_at);
        if (clash) throw apiError('conflict', 'Veterinarian is not available in that slot', 409);
      }
      const created = db
        .prepare(
          `INSERT INTO appointments (pet_id, vet_user_id, starts_at, ends_at, reason)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(body.pet_id, body.vet_user_id ?? null, body.starts_at, body.ends_at, body.reason || null);
      res.status(201).json({
        appointment: { id: Number(created.lastInsertRowid), status: 'scheduled', ...body },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/appointments/:id/status', requireRole(...STAFF), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const parsed = z.object({ status: z.enum(STATUS) }).safeParse(req.body);
      if (!parsed.success) throw apiError('validation_error', 'Invalid status', 400);
      const current = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
      if (!current) throw apiError('not_found', 'Appointment not found', 404);
      if (!TRANSITIONS[current.status].includes(parsed.data.status)) {
        throw apiError(
          'invalid_transition',
          `Cannot move from ${current.status} to ${parsed.data.status}`,
          409,
        );
      }
      db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(parsed.data.status, id);
      res.json({ appointment: db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAppointmentRoutes };
