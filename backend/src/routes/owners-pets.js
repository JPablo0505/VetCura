const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, saveUpload, multerErrorHandler } = require('../lib/uploads');
const { serveUpload } = require('./profile');
const { audit } = require('../lib/audit');

const STAFF = ['admin', 'vet', 'staff'];

const ownerSchema = z.object({
  display_name: z.string().min(1).max(255),
  // Real email enables later Google Sign-In linking (matched by address).
  // Without it the owner shell can only be claimed once staff sets an email.
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
});

const petSchema = z.object({
  owner_id: z.number().int().positive(),
  name: z.string().min(1).max(120),
  species: z.string().min(1).max(80),
  breed: z.string().max(120).nullable().optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
  sex: z.enum(['male', 'female', 'unknown']).default('unknown'),
  weight_kg: z.number().positive().max(500).nullable().optional(),
  photo_url: z.string().max(1000).nullable().optional(),
});

const petPatchSchema = petSchema.omit({ owner_id: true }).partial().strict();

function ownerIdFor(db, user) {
  if (user.role !== 'owner') return null;
  return user.sub;
}

function petVisibleTo(db, petId, user) {
  const pet = db.prepare('SELECT id, owner_id FROM pets WHERE id = ?').get(petId);
  if (!pet) return null;
  if (user.role === 'owner' && pet.owner_id !== ownerIdFor(db, user)) return undefined;
  return pet;
}

function buildOwnerPetRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  // ---- Owners (staff only, except owners reading self) ----
  router.get('/owners', requireRole(...STAFF), (req, res, next) => {
    try {
      const rows = db
        .prepare(
          `SELECT u.id AS user_id, u.email, u.display_name, o.phone, o.address
           FROM owners o JOIN users u ON u.id = o.user_id ORDER BY u.display_name`,
        )
        .all();
      res.json({ owners: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/owners', requireRole('admin', 'staff'), (req, res, next) => {
    try {
      const body = validate(ownerSchema, req.body);
      const email = body.email ? body.email.toLowerCase() : `owner-${Date.now()}@placeholder.local`;
      let userId;
      try {
        const created = db
          .prepare('INSERT INTO users (email, role, display_name) VALUES (?, ?, ?)')
          .run(email, 'owner', body.display_name);
        userId = Number(created.lastInsertRowid);
      } catch (e) {
        if (e && e.code === 'ERR_SQLITE_ERROR' && /UNIQUE/i.test(e.message)) {
          throw apiError('conflict', 'That email is already registered', 409);
        }
        throw e;
      }
      db.prepare('INSERT INTO owners (user_id, phone, address) VALUES (?, ?, ?)').run(
        userId,
        body.phone || null,
        body.address || null,
      );
      res.status(201).json({ owner: { user_id: userId, ...body, email } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/owners/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (req.user.role === 'owner' && id !== req.user.sub) {
        throw apiError('forbidden', 'Owners can only view their own profile', 403);
      }
      const owner = db
        .prepare(
          `SELECT u.id AS user_id, u.email, u.display_name, o.phone, o.address,
                  o.photo_path,
                  CASE WHEN u.email_verified_at IS NULL THEN 0 ELSE 1 END AS email_verified
           FROM owners o JOIN users u ON u.id = o.user_id WHERE u.id = ?`,
        )
        .get(id);
      if (!owner) throw apiError('not_found', 'Owner not found', 404);
      const pets = db.prepare('SELECT * FROM pets WHERE owner_id = ? ORDER BY name').all(id);
      res.json({ owner, pets });
    } catch (err) {
      next(err);
    }
  });

  // ---- Pets ----
  router.get('/pets', (req, res, next) => {
    try {
      let rows;
      if (req.user.role === 'owner') {
        rows = db.prepare('SELECT * FROM pets WHERE owner_id = ? ORDER BY name').all(req.user.sub);
      } else {
        rows = db.prepare('SELECT * FROM pets ORDER BY name').all();
      }
      res.json({ pets: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/pets', requireRole(...STAFF), (req, res, next) => {
    try {
      const body = validate(petSchema, req.body);
      const owner = db.prepare('SELECT user_id FROM owners WHERE user_id = ?').get(body.owner_id);
      if (!owner) throw apiError('not_found', 'Owner not found', 404);
      const created = db
        .prepare(
          `INSERT INTO pets (owner_id, name, species, breed, birthdate, sex, weight_kg, photo_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.owner_id, body.name, body.species, body.breed || null,
          body.birthdate || null, body.sex, body.weight_kg ?? null, body.photo_url || null,
        );
      res.status(201).json({
        pet: { id: Number(created.lastInsertRowid), ...body },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/pets/:id', (req, res, next) => {
    try {
      const pet = petVisibleTo(db, Number(req.params.id), req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      const full = db.prepare('SELECT * FROM pets WHERE id = ?').get(pet.id);
      const vaccinations = db
        .prepare('SELECT * FROM vaccinations WHERE pet_id = ? ORDER BY due_date')
        .all(pet.id);
      const measurements = db
        .prepare('SELECT weight_kg, measured_at AS date, source FROM pet_weight_measurements WHERE pet_id = ? ORDER BY measured_at DESC, id DESC LIMIT 50')
        .all(pet.id);
      res.json({ pet: full, vaccinations, measurements });
    } catch (err) {
      next(err);
    }
  });

  router.get('/pets/:id/measurements', (req, res, next) => {
    try {
      const pet = petVisibleTo(db, Number(req.params.id), req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      const rows = db
        .prepare('SELECT weight_kg, measured_at AS date, source FROM pet_weight_measurements WHERE pet_id = ? ORDER BY measured_at, id')
        .all(pet.id);
      res.json({ measurements: rows });
    } catch (err) {
      next(err);
    }
  });

  // Owners edit their OWN pets; staff edit any. owner_id is never
  // writable (ownership derives from the session, never the client).
  // weight_kg appends a dated measurement instead of rewriting history.
  router.patch('/pets/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const pet = petVisibleTo(db, id, req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      const body = validate(petPatchSchema, req.body);
      const { weight_kg: weight, ...rest } = body;
      const fields = Object.entries(rest).filter(([, v]) => v !== undefined);
      if (fields.length > 0) {
        const set = fields.map(([k]) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE pets SET ${set}, updated_at = datetime('now') WHERE id = ?`)
          .run(...fields.map(([, v]) => v), id);
      }
      let measurement = null;
      if (weight !== undefined && weight !== null) {
        const today = new Date().toISOString().slice(0, 10);
        const created = db.prepare(
          "INSERT INTO pet_weight_measurements (pet_id, weight_kg, measured_at, source) VALUES (?, ?, ?, 'manual')",
        ).run(id, weight, today);
        db.prepare('UPDATE pets SET weight_kg = ?, updated_at = datetime(\'now\') WHERE id = ?').run(weight, id);
        measurement = { id: Number(created.lastInsertRowid), weight_kg: weight, date: today };
      }
      audit(db, { actor: req.user.sub, action: 'pet.update', targetType: 'pet', targetId: id });
      res.json({ pet: db.prepare('SELECT * FROM pets WHERE id = ?').get(id), measurement });
    } catch (err) {
      next(err);
    }
  });

  router.post('/pets/:id/photo', upload.single('photo'), multerErrorHandler, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const pet = petVisibleTo(db, id, req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      if (!req.file) throw apiError('validation_error', 'Missing photo file (field: photo)', 400);
      const saved = saveUpload(`pet-${id}`, req.file.buffer);
      db.prepare('UPDATE pets SET photo_path = ?, updated_at = datetime(\'now\') WHERE id = ?').run(saved.filename, id);
      audit(db, { actor: req.user.sub, action: 'pet.photo.update', targetType: 'pet', targetId: id });
      res.status(201).json({ photo: saved.filename });
    } catch (err) {
      next(err);
    }
  });

  router.get('/pets/:id/photo', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const pet = petVisibleTo(db, id, req.user);
      if (pet === null) throw apiError('not_found', 'Pet not found', 404);
      if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
      const row = db.prepare('SELECT photo_path FROM pets WHERE id = ?').get(id);
      if (!row || !row.photo_path) throw apiError('not_found', 'No photo on file', 404);
      return serveUpload(res, row.photo_path, next);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildOwnerPetRoutes, petVisibleTo };
