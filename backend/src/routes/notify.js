const express = require('express');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { reconcile, processDue, buildEmailProvider, buildPushProvider } = require('../lib/notify');
const { audit } = require('../lib/audit');

const deviceSchema = z.object({
  fcm_token: z.string().min(10).max(4096),
  platform: z.string().max(20).default('android'),
});

function buildNotifyRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  // Devices always belong to the CALLER: user derives from the session,
  // never from a client-supplied owner_id.
  router.get('/me/devices', (req, res, next) => {
    try {
      const rows = db
        .prepare('SELECT id, platform, last_seen, created_at FROM devices WHERE user_id = ? ORDER BY last_seen DESC')
        .all(req.user.sub);
      res.json({ devices: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/me/devices', (req, res, next) => {
    try {
      const body = validate(deviceSchema, req.body);
      const taken = db.prepare('SELECT user_id FROM devices WHERE fcm_token = ?').get(body.fcm_token);
      if (taken && taken.user_id !== req.user.sub) {
        throw apiError('conflict', 'This device is registered to another account', 409);
      }
      db.prepare(
        `INSERT INTO devices (user_id, platform, fcm_token, last_seen) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(fcm_token) DO UPDATE SET last_seen = datetime('now'), user_id = excluded.user_id`,
      ).run(req.user.sub, body.platform, body.fcm_token);
      res.status(201).json({ registered: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/me/devices/:id', (req, res, next) => {
    try {
      const gone = db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.sub);
      if (gone.changes === 0) throw apiError('not_found', 'Device not found', 404);
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/notifications', (req, res, next) => {
    try {
      const status = req.query.status;
      const rows = status
        ? db.prepare('SELECT id, kind, title, body, status, attempts, scheduled_for, sent_at FROM notification_queue WHERE user_id = ? AND status = ? ORDER BY scheduled_for DESC LIMIT 100').all(req.user.sub, status)
        : db.prepare('SELECT id, kind, title, body, status, attempts, scheduled_for, sent_at FROM notification_queue WHERE user_id = ? ORDER BY scheduled_for DESC LIMIT 100').all(req.user.sub);
      res.json({ notifications: rows });
    } catch (err) {
      next(err);
    }
  });

  // ---- Admin operations ----
  router.get('/admin/notifications', requireRole('admin', 'staff'), (req, res, next) => {
    try {
      const status = req.query.status;
      const rows = status
        ? db.prepare('SELECT * FROM notification_queue WHERE status = ? ORDER BY scheduled_for DESC LIMIT 200').all(status)
        : db.prepare('SELECT * FROM notification_queue ORDER BY scheduled_for DESC LIMIT 200').all();
      res.json({ notifications: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/notifications/run', requireRole('admin'), (req, res, next) => {
    (async () => {
      try {
        reconcile(db);
        const counts = await processDue(db, { email: buildEmailProvider(), push: buildPushProvider() });
        audit(db, { actor: req.user.sub, action: 'notify.run', targetType: null, targetId: null });
        res.json({ counts });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}

module.exports = { buildNotifyRoutes };
