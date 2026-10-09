const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = ['admin', 'vet', 'staff'];

const ownerSchema = z.object({
  display_name: z.string().min(1).max(255),
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

const petPatchSchema = petSchema.omit({ owner_id: true }).partial();

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
      const created = db
        .prepare('INSERT INTO users (email, role, display_name) VALUES (?, ?, ?)')
        .run(`owner-${Date.now()}@placeholder.local`, 'owner', body.display_name);
      db.prepare('INSERT INTO owners (user_id, phone, address) VALUES (?, ?, ?)').run(
        Number(created.lastInsertRowid),
        body.phone || null,
        body.address || null,
      );
      res.status(201).json({ owner: { user_id: Number(created.lastInsertRowid), ...body } });
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
          `SELECT u.id AS user_id, u.email, u.display_name, o.phone, o.address
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
      res.json({ pet: full, vaccinations });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/pets/:id', requireRole(...STAFF), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const exists = db.prepare('SELECT id FROM pets WHERE id = ?').get(id);
      if (!exists) throw apiError('not_found', 'Pet not found', 404);
      const body = validate(petPatchSchema, req.body);
      const fields = Object.entries(body).filter(([, v]) => v !== undefined);
      if (fields.length > 0) {
        const set = fields.map(([k]) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE pets SET ${set} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      res.json({ pet: db.prepare('SELECT * FROM pets WHERE id = ?').get(id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildOwnerPetRoutes, petVisibleTo };
