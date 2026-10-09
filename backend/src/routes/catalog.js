const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = ['admin', 'vet', 'staff'];

const medicationSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(['drug', 'supply']),
  price_cents: z.number().int().min(0),
  stock: z.number().int().min(0).default(0),
});

function buildCatalogRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/vets', requireRole(...STAFF), (req, res, next) => {
    try {
      const rows = db
        .prepare("SELECT id, email, display_name FROM users WHERE role IN ('vet','admin') ORDER BY display_name")
        .all();
      res.json({ vets: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/medications', (req, res, next) => {
    try {
      const q = (req.query.q || '').toString().trim();
      const rows = q
        ? db.prepare('SELECT * FROM medications WHERE name LIKE ? ORDER BY name').all(`%${q}%`)
        : db.prepare('SELECT * FROM medications ORDER BY name').all();
      res.json({ medications: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/medications', requireRole('admin', 'vet'), (req, res, next) => {
    try {
      const body = validate(medicationSchema, req.body);
      const created = db
        .prepare('INSERT INTO medications (name, kind, price_cents, stock) VALUES (?, ?, ?, ?)')
        .run(body.name, body.kind, body.price_cents, body.stock);
      res.status(201).json({
        medication: { id: Number(created.lastInsertRowid), ...body },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildCatalogRoutes };
