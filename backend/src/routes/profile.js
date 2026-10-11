const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, saveUpload, multerErrorHandler, uploadDir } = require('../lib/uploads');
const { audit } = require('../lib/audit');

const STAFF = ['admin', 'vet', 'staff'];
const PREF_KEYS = ['push_enabled', 'email_enabled', 'appointment_reminders', 'vaccination_reminders'];

const profileSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
}).strict();

const prefsSchema = z.object({
  push_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  appointment_reminders: z.boolean().optional(),
  vaccination_reminders: z.boolean().optional(),
}).strict();

function ensurePrefs(db, userId) {
  db.prepare('INSERT INTO notification_prefs (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING').run(userId);
  return db.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(userId);
}

function serializeOwner(db, userId) {
  const owner = db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.display_name, u.role,
              CASE WHEN u.email_verified_at IS NULL THEN 0 ELSE 1 END AS email_verified,
              o.phone, o.address, o.photo_path, o.updated_at AS profile_updated_at,
              (SELECT created_at FROM users WHERE id = u.id) AS created_at
       FROM owners o JOIN users u ON u.id = o.user_id WHERE u.id = ?`,
    )
    .get(userId);
  if (!owner) return null;
  return { ...owner, preferences: ensurePrefs(db, userId) };
}

function buildProfileRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/me/profile', (req, res, next) => {
    try {
      if (req.user.role !== 'owner') throw apiError('forbidden', 'Owners only', 403);
      const profile = serializeOwner(db, req.user.sub);
      if (!profile) throw apiError('not_found', 'Owner profile not found', 404);
      res.json({ profile });
    } catch (err) {
      next(err);
    }
  });

  // Partial update: only provided whitelisted fields change; role, email
  // and ids are never writable here.
  router.patch('/me/profile', (req, res, next) => {
    try {
      if (req.user.role !== 'owner') throw apiError('forbidden', 'Owners only', 403);
      const body = validate(profileSchema, req.body);
      const exists = db.prepare('SELECT user_id FROM owners WHERE user_id = ?').get(req.user.sub);
      if (!exists) throw apiError('not_found', 'Owner profile not found', 404);
      if (body.display_name !== undefined) {
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(body.display_name, req.user.sub);
      }
      const patch = {};
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.address !== undefined) patch.address = body.address;
      const fields = Object.entries(patch);
      if (fields.length > 0) {
        const set = fields.map(([k]) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE owners SET ${set}, updated_at = datetime('now') WHERE user_id = ?`)
          .run(...fields.map(([, v]) => v), req.user.sub);
      }
      audit(db, { actor: req.user.sub, action: 'owner.profile.update', targetType: 'owner', targetId: req.user.sub });
      res.json({ profile: serializeOwner(db, req.user.sub) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/preferences', (req, res, next) => {
    try {
      res.json({ preferences: ensurePrefs(db, req.user.sub) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me/preferences', (req, res, next) => {
    try {
      const body = validate(prefsSchema, req.body);
      ensurePrefs(db, req.user.sub);
      const fields = Object.entries(body);
      if (fields.length > 0) {
        const set = fields.map(([k]) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE notification_prefs SET ${set}, updated_at = datetime('now') WHERE user_id = ?`)
          .run(...fields.map(([, v]) => (v ? 1 : 0)), req.user.sub);
      }
      res.json({ preferences: ensurePrefs(db, req.user.sub) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/me/photo', upload.single('photo'), multerErrorHandler, (req, res, next) => {
    try {
      if (req.user.role !== 'owner') throw apiError('forbidden', 'Owners only', 403);
      if (!req.file) throw apiError('validation_error', 'Missing photo file (field: photo)', 400);
      const saved = saveUpload(`owner-${req.user.sub}`, req.file.buffer);
      db.prepare('UPDATE owners SET photo_path = ?, updated_at = datetime(\'now\') WHERE user_id = ?')
        .run(saved.filename, req.user.sub);
      audit(db, { actor: req.user.sub, action: 'owner.photo.update', targetType: 'owner', targetId: req.user.sub });
      res.status(201).json({ photo: saved.filename });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/photo', (req, res, next) => {
    try {
      if (req.user.role !== 'owner') throw apiError('forbidden', 'Owners only', 403);
      const row = db.prepare('SELECT photo_path FROM owners WHERE user_id = ?').get(req.user.sub);
      if (!row || !row.photo_path) throw apiError('not_found', 'No photo on file', 404);
      return serveUpload(res, row.photo_path, next);
    } catch (err) {
      next(err);
    }
  });

  // ---- Staff-side owner data management (admin/staff/vet read, admin/staff write) ----
  router.patch('/owners/:id', requireRole('admin', 'staff'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const body = validate(profileSchema, req.body);
      const exists = db.prepare('SELECT user_id FROM owners WHERE user_id = ?').get(id);
      if (!exists) throw apiError('not_found', 'Owner not found', 404);
      if (body.display_name !== undefined) {
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(body.display_name, id);
      }
      const patch = {};
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.address !== undefined) patch.address = body.address;
      const fields = Object.entries(patch);
      if (fields.length > 0) {
        const set = fields.map(([k]) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE owners SET ${set}, updated_at = datetime('now') WHERE user_id = ?`)
          .run(...fields.map(([, v]) => v), id);
      }
      audit(db, { actor: req.user.sub, action: 'owner.profile.update', targetType: 'owner', targetId: id });
      res.json({ profile: serializeOwner(db, id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function serveUpload(res, filename, next) {
  const safe = path.basename(filename);
  const full = path.resolve(uploadDir(), safe);
  if (!fs.existsSync(full)) {
    next(apiError('not_found', 'File not found', 404));
    return undefined;
  }
  const ext = path.extname(safe).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
  res.set('Content-Type', mime);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, max-age=3600');
  return res.sendFile(full);
}

module.exports = { buildProfileRoutes, ensurePrefs, serveUpload };
