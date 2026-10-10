const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { runInTransaction } = require('../lib/transaction');
const { petVisibleTo } = require('./owners-pets');

const STAFF = ['admin', 'vet', 'staff'];
const STATUS = ['draft', 'issued', 'paid', 'void'];
const TRANSITIONS = {
  draft: ['issued', 'void'],
  issued: ['paid', 'void'],
  paid: [],
  void: [],
};

const invoiceSchema = z.object({
  pet_id: z.number().int().positive(),
});

const itemSchema = z.object({
  medication_id: z.number().int().positive().nullable().optional(),
  description: z.string().min(1).max(500),
  qty: z.number().int().positive().max(10000),
  // Clients MAY send a price, but the server always resolves the
  // authoritative unit price (catalog price or explicit staff price).
  unit_price_cents: z.number().int().min(0).nullable().optional(),
});

// Colombian IVA (19% general rate). Override with TAX_RATE.
function taxRate() {
  const raw = Number(process.env.TAX_RATE ?? 0.19);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.19;
}

// Totals are ALWAYS recomputed server-side inside a transaction.
function recomputeTotals(db, invoiceId) {
  const items = db
    .prepare('SELECT qty, unit_price_cents FROM invoice_items WHERE invoice_id = ?')
    .all(invoiceId);
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.unit_price_cents, 0);
  const tax = Math.round(subtotal * taxRate());
  db.prepare('UPDATE invoices SET subtotal_cents = ?, tax_cents = ?, total_cents = ? WHERE id = ?').run(
    subtotal, tax, subtotal + tax, invoiceId,
  );
}

function serializeInvoice(db, id) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) return null;
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id);
  return { ...invoice, items };
}

function buildInvoiceRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/invoices', (req, res, next) => {
    try {
      let rows;
      if (req.user.role === 'owner') {
        rows = db
          .prepare('SELECT * FROM invoices WHERE owner_id = ? ORDER BY id DESC')
          .all(req.user.sub);
      } else {
        rows = db.prepare('SELECT * FROM invoices ORDER BY id DESC').all();
      }
      res.json({ invoices: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/invoices/:id', (req, res, next) => {
    try {
      const invoice = serializeInvoice(db, Number(req.params.id));
      if (!invoice) throw apiError('not_found', 'Invoice not found', 404);
      if (req.user.role === 'owner' && invoice.owner_id !== req.user.sub) {
        throw apiError('forbidden', 'Not your invoice', 403);
      }
      res.json({ invoice });
    } catch (err) {
      next(err);
    }
  });

  router.post('/invoices', requireRole(...STAFF), (req, res, next) => {
    try {
      const body = validate(invoiceSchema, req.body);
      const pet = db.prepare('SELECT id, owner_id FROM pets WHERE id = ?').get(body.pet_id);
      if (!pet) throw apiError('not_found', 'Pet not found', 404);
      const created = db
        .prepare("INSERT INTO invoices (pet_id, owner_id, status) VALUES (?, ?, 'draft')")
        .run(body.pet_id, pet.owner_id);
      res.status(201).json({ invoice: serializeInvoice(db, Number(created.lastInsertRowid)) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/invoices/:id/items', requireRole(...STAFF), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!invoice) throw apiError('not_found', 'Invoice not found', 404);
      if (invoice.status !== 'draft') {
        throw apiError('conflict', 'Only draft invoices can be edited', 409);
      }
      const body = validate(itemSchema, req.body);
      let unitPrice = body.unit_price_cents;
      let description = body.description;
      if (body.medication_id) {
        const med = db.prepare('SELECT * FROM medications WHERE id = ?').get(body.medication_id);
        if (!med) throw apiError('not_found', 'Medication not found', 404);
        // Catalog price is authoritative unless staff explicitly overrides.
        if (unitPrice == null) unitPrice = med.price_cents;
        if (!body.description || body.description === med.name) description = med.name;
      }
      if (unitPrice == null) {
        throw apiError('validation_error', 'unit_price_cents is required for custom items', 400);
      }
      const tx = () =>
        runInTransaction(db, () => {
          db.prepare(
            `INSERT INTO invoice_items
               (invoice_id, medication_id, description, qty, unit_price_cents, line_total_cents)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(id, body.medication_id ?? null, description, body.qty, unitPrice, body.qty * unitPrice);
          recomputeTotals(db, id);
        });
      tx();
      res.status(201).json({ invoice: serializeInvoice(db, id) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/invoices/:id/items/:itemId', requireRole(...STAFF), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!invoice) throw apiError('not_found', 'Invoice not found', 404);
      if (invoice.status !== 'draft') {
        throw apiError('conflict', 'Only draft invoices can be edited', 409);
      }
      const tx = () =>
        runInTransaction(db, () => {
          const deleted = db
            .prepare('DELETE FROM invoice_items WHERE id = ? AND invoice_id = ?')
            .run(Number(req.params.itemId), id);
          if (deleted.changes === 0) throw apiError('not_found', 'Item not found', 404);
          recomputeTotals(db, id);
        });
      tx();
      res.json({ invoice: serializeInvoice(db, id) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/invoices/:id/status', requireRole(...STAFF), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const parsed = z.object({ status: z.enum(STATUS) }).safeParse(req.body);
      if (!parsed.success) throw apiError('validation_error', 'Invalid status', 400);
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!invoice) throw apiError('not_found', 'Invoice not found', 404);
      if (!TRANSITIONS[invoice.status].includes(parsed.data.status)) {
        throw apiError(
          'invalid_transition',
          `Cannot move from ${invoice.status} to ${parsed.data.status}`,
          409,
        );
      }
      const tx = () =>
        runInTransaction(db, () => {
          recomputeTotals(db, id);
          if (parsed.data.status === 'issued') {
            db.prepare("UPDATE invoices SET status = 'issued', issued_at = datetime('now') WHERE id = ?").run(id);
          } else {
            db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(parsed.data.status, id);
          }
        });
      tx();
      res.json({ invoice: serializeInvoice(db, id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildInvoiceRoutes, recomputeTotals, taxRate };
