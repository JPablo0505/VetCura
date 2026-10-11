const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { petVisibleTo } = require('./owners-pets');
const { enqueue } = require('../lib/notify');

const STAFF = ['admin', 'vet', 'staff'];

const consultationSchema = z.object({
  appointment_id: z.number().int().positive().nullable().optional(),
  pet_id: z.number().int().positive(),
  weight_kg: z.number().positive().max(500).nullable().optional(),
  diagnosis: z.string().min(1).max(2000),
  treatment: z.string().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  // Trial detailed history: internal detail stays staff-only; the client
  // sees client_summary + prescription + exams + invoice only.
  internal_notes: z.string().max(4000).nullable().optional(),
  client_summary: z.string().min(1).max(500).nullable().optional(),
  allergies: z.array(z.string().min(1).max(200)).max(50).default([]),
});

const vaccinationSchema = z.object({
  pet_id: z.number().int().positive(),
  vaccine: z.string().min(1).max(200),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  given_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
}).refine(
  (v) => !v.given_date || v.given_date <= new Date().toISOString().slice(0, 10),
  { message: 'given_date cannot be in the future', path: ['given_date'] },
);

function buildClinicalRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  // ---- Consultations ----
  router.post('/consultations', requireRole('admin', 'vet'), (req, res, next) => {
    try {
      const body = validate(consultationSchema, req.body);
      const pet = db.prepare('SELECT id FROM pets WHERE id = ?').get(body.pet_id);
      if (!pet) throw apiError('not_found', 'Pet not found', 404);
      if (body.appointment_id) {
        const appt = db.prepare('SELECT id FROM appointments WHERE id = ?').get(body.appointment_id);
        if (!appt) throw apiError('not_found', 'Appointment not found', 404);
      }
      const created = db
        .prepare(
          `INSERT INTO consultations
             (appointment_id, pet_id, vet_user_id, weight_kg, diagnosis, treatment, notes,
              internal_notes, client_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.appointment_id ?? null, body.pet_id, req.user.sub,
          body.weight_kg ?? null, body.diagnosis, body.treatment || null, body.notes || null,
          body.internal_notes || null,
          body.client_summary || 'Atención veterinaria realizada. Consultá la receta y la factura para más detalles.',
        );
      const id = Number(created.lastInsertRowid);
      const insertAllergy = db.prepare(
        'INSERT INTO consultation_allergies (consultation_id, allergy) VALUES (?, ?)',
      );
      for (const allergy of body.allergies) insertAllergy.run(id, allergy);
      if (body.weight_kg) {
        db.prepare('UPDATE pets SET weight_kg = ? WHERE id = ?').run(body.weight_kg, body.pet_id);
        // Mirror into the append-only measurement timeline.
        db.prepare(
          "INSERT INTO pet_weight_measurements (pet_id, weight_kg, measured_at, source) VALUES (?, ?, date('now'), 'consultation')",
        ).run(body.pet_id, body.weight_kg);
      }
      // Operational notice: new clinical info is available in the owner app.
      // Minimal payload (no clinical detail); prefs-gated inside enqueue.
      const ownerRow = db.prepare('SELECT owner_id FROM pets WHERE id = ?').get(body.pet_id);
      if (ownerRow) {
        enqueue(db, {
          key: `consult:${id}`,
          userId: ownerRow.owner_id,
          kind: 'clinic',
          title: 'VetCura: nueva información clínica',
          body: 'Hay información nueva de tu mascota. Abre la app para ver los detalles.',
        });
      }
      res.status(201).json({ consultation: { id, ...body, vet_user_id: req.user.sub } });
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return next(apiError('conflict', 'Appointment already has a consultation', 409));
      }
      return next(err);
    }
  });

  // Chronological clinical history per pet (consultations + vaccinations).
  router.get('/pets/:id/history', (req, res, next) => {
    try {
      const pet = petVisibleTo(db, Number(req.params.id), req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      const consultations = db
        .prepare(
          `SELECT c.*, u.display_name AS vet_name FROM consultations c
           JOIN users u ON u.id = c.vet_user_id
           WHERE c.pet_id = ? ORDER BY c.created_at DESC, c.id DESC`,
        )
        .all(pet.id);
      const allergyRows = db
        .prepare(
          `SELECT consultation_id, allergy FROM consultation_allergies
           WHERE consultation_id IN (SELECT id FROM consultations WHERE pet_id = ?)`,
        )
        .all(pet.id);
      const byConsultation = new Map();
      for (const row of allergyRows) {
        if (!byConsultation.has(row.consultation_id)) byConsultation.set(row.consultation_id, []);
        byConsultation.get(row.consultation_id).push(row.allergy);
      }
      const vaccinations = db
        .prepare('SELECT * FROM vaccinations WHERE pet_id = ? ORDER BY due_date DESC')
        .all(pet.id);
      const isStaff = STAFF.includes(req.user.role);
      res.json({
        consultations: consultations.map((c) => {
          const base = {
            id: c.id,
            pet_id: c.pet_id,
            created_at: c.created_at,
            vet_name: c.vet_name,
            weight_kg: c.weight_kg,
            allergies: byConsultation.get(c.id) || [],
          };
          // Trial visibility split: owners see the generic summary (plus
          // prescription/exams/invoice through their own endpoints);
          // internal detail stays with staff.
          if (isStaff) {
            return {
              ...base,
              appointment_id: c.appointment_id,
              diagnosis: c.diagnosis,
              treatment: c.treatment,
              notes: c.notes,
              internal_notes: c.internal_notes,
              client_summary: c.client_summary,
            };
          }
          return { ...base, client_summary: c.client_summary };
        }),
        vaccinations,
      });
    } catch (err) {
      next(err);
    }
  });

  // Weight history derived from consultations.
  router.get('/pets/:id/weight-history', (req, res, next) => {
    try {
      const pet = petVisibleTo(db, Number(req.params.id), req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      const rows = db
        .prepare(
          `SELECT created_at AS date, weight_kg FROM consultations
           WHERE pet_id = ? AND weight_kg IS NOT NULL ORDER BY created_at, id`,
        )
        .all(pet.id);
      res.json({ history: rows });
    } catch (err) {
      next(err);
    }
  });

  // ---- Vaccinations ----
  router.post('/vaccinations', requireRole(...STAFF), (req, res, next) => {
    try {
      const body = validate(vaccinationSchema, req.body);
      const pet = db.prepare('SELECT id FROM pets WHERE id = ?').get(body.pet_id);
      if (!pet) throw apiError('not_found', 'Pet not found', 404);
      const created = db
        .prepare(
          'INSERT INTO vaccinations (pet_id, vaccine, due_date, given_date) VALUES (?, ?, ?, ?)',
        )
        .run(body.pet_id, body.vaccine, body.due_date, body.given_date || null);
      res.status(201).json({
        vaccination: { id: Number(created.lastInsertRowid), ...body },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/vaccinations/:id', requireRole(...STAFF), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const body = validate(vaccinationSchema.partial(), req.body);
      const existing = db.prepare('SELECT * FROM vaccinations WHERE id = ?').get(id);
      if (!existing) throw apiError('not_found', 'Vaccination not found', 404);
      const merged = { ...existing, ...Object.fromEntries(
        Object.entries(body).filter(([, v]) => v !== undefined),
      ) };
      db.prepare(
        'UPDATE vaccinations SET vaccine = ?, due_date = ?, given_date = ? WHERE id = ?',
      ).run(merged.vaccine, merged.due_date, merged.given_date || null, id);
      res.json({ vaccination: db.prepare('SELECT * FROM vaccinations WHERE id = ?').get(id) });
    } catch (err) {
      next(err);
    }
  });

  // Alerts: overdue + due within 30 days, still not given.
  router.get('/vaccinations/alerts', (req, res, next) => {
    try {
      let sql = `SELECT v.*, p.name AS pet_name, p.owner_id FROM vaccinations v
                 JOIN pets p ON p.id = v.pet_id
                 WHERE v.given_date IS NULL AND date(v.due_date) <= date('now', '+30 days')`;
      const params = [];
      if (req.user.role === 'owner') {
        sql += ' AND p.owner_id = ?';
        params.push(req.user.sub);
      }
      sql += ' ORDER BY v.due_date';
      const rows = db.prepare(sql).all(...params);
      res.json({
        alerts: rows.map((r) => ({
          ...r,
          overdue: r.due_date < new Date().toISOString().slice(0, 10),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildClinicalRoutes };
