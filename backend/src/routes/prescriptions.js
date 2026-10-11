const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { runInTransaction } = require('../lib/transaction');

const itemSchema = z.object({
  medication_name: z.string().min(1).max(200),
  form: z.string().min(1).max(80),
  strength_mg: z.number().positive().max(100000).nullable().optional(),
  administration: z.string().min(1).max(1000),
  qty_per_dose: z.number().positive().max(1000),
  times_per_day: z.number().int().positive().max(24),
  duration_days: z.number().int().positive().max(365),
});

const prescriptionSchema = z.object({
  recommendations: z.string().max(2000).nullable().optional(),
  warning_signs: z.string().max(2000).nullable().optional(),
  recheck: z.string().max(200).nullable().optional(),
  items: z.array(itemSchema).min(1).max(30),
});

function serializePrescription(db, id) {
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id);
  if (!prescription) return null;
  const items = db.prepare('SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY item_no').all(id);
  return { ...prescription, items };
}

function consultationPetId(db, consultationId) {
  const row = db.prepare('SELECT pet_id FROM consultations WHERE id = ?').get(consultationId);
  return row ? row.pet_id : null;
}

function assertPetAccess(db, user, petId) {
  const { petVisibleTo } = require('./owners-pets');
  const pet = petVisibleTo(db, petId, user);
  if (pet === null) throw apiError('not_found', 'Consultation not found', 404);
  if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
}

function buildPrescriptionRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  // One formal prescription per consultation (vet). Units are computed
  // server-side: qty_per_dose × times_per_day × duration_days.
  router.post('/consultations/:id/prescription', requireRole('admin', 'vet'), (req, res, next) => {
    try {
      const consultationId = Number(req.params.id);
      const petId = consultationPetId(db, consultationId);
      if (!petId) throw apiError('not_found', 'Consultation not found', 404);
      const body = validate(prescriptionSchema, req.body);
      const tx = () =>
        runInTransaction(db, () => {
          const exists = db.prepare('SELECT id FROM prescriptions WHERE consultation_id = ?').get(consultationId);
          if (exists) throw apiError('conflict', 'This consultation already has a prescription', 409);
          const created = db.prepare(
            'INSERT INTO prescriptions (consultation_id, recommendations, warning_signs, recheck) VALUES (?, ?, ?, ?)',
          ).run(consultationId, body.recommendations || null, body.warning_signs || null, body.recheck || null);
          const pid = Number(created.lastInsertRowid);
          const insertItem = db.prepare(
            `INSERT INTO prescription_items
               (prescription_id, item_no, medication_name, form, strength_mg,
                administration, qty_per_dose, times_per_day, duration_days, total_units)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          body.items.forEach((item, i) => {
            insertItem.run(
              pid, i + 1, item.medication_name, item.form, item.strength_mg ?? null,
              item.administration, item.qty_per_dose, item.times_per_day, item.duration_days,
              item.qty_per_dose * item.times_per_day * item.duration_days,
            );
          });
          return pid;
        });
      const pid = tx();
      res.status(201).json({ prescription: serializePrescription(db, pid) });
    } catch (err) {
      if (err && err.code === 'ERR_SQLITE_ERROR' && /UNIQUE/i.test(err.message)) {
        return next(apiError('conflict', 'This consultation already has a prescription', 409));
      }
      return next(err);
    }
  });

  // Owners read their own pets' prescriptions; staff read any.
  // The payload carries the header context needed for the formal layout.
  router.get('/consultations/:id/prescription', (req, res, next) => {
    try {
      const consultationId = Number(req.params.id);
      const petId = consultationPetId(db, consultationId);
      if (!petId) throw apiError('not_found', 'Consultation not found', 404);
      assertPetAccess(db, req.user, petId);
      const prescription = db.prepare('SELECT * FROM prescriptions WHERE consultation_id = ?').get(consultationId);
      if (!prescription) throw apiError('not_found', 'No prescription for this consultation', 404);
      const full = serializePrescription(db, prescription.id);
      const context = db
        .prepare(
          `SELECT c.created_at AS issued_at, p.name AS pet_name, p.species, p.breed,
                  p.sex, p.weight_kg, p.birthdate, u.display_name AS owner_name,
                  v.display_name AS vet_name, v.professional_id AS vet_professional_id
           FROM consultations c
           JOIN pets p ON p.id = c.pet_id
           JOIN users u ON u.id = p.owner_id
           JOIN users v ON v.id = c.vet_user_id
           WHERE c.id = ?`,
        )
        .get(consultationId);
      res.json({ prescription: { ...full, ...context } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildPrescriptionRoutes, serializePrescription };
