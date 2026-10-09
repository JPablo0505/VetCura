const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { signToken, requireAuth } = require('../middleware/auth');

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
});

const googleSchema = z.object({
  id_token: z.string().min(10).max(8192),
});

function buildAuthRoutes(db) {
  const router = express.Router();

  router.post('/login', (req, res, next) => {
    try {
      const { email, password } = validate(loginSchema, req.body);
      const user = db
        .prepare('SELECT id, email, password_hash, role, display_name FROM users WHERE email = ?')
        .get(email);
      if (!user || !user.password_hash) {
        throw apiError('invalid_credentials', 'Invalid email or password', 401);
      }
      if (!bcrypt.compareSync(password, user.password_hash)) {
        throw apiError('invalid_credentials', 'Invalid email or password', 401);
      }
      const token = signToken(user);
      res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name },
      });
    } catch (err) {
      next(err);
    }
  });

  // Google Sign-In for owners. Requires GOOGLE_CLIENT_ID; without it the
  // endpoint honestly reports unavailability instead of faking a session.
  router.post('/google', async (req, res, next) => {
    try {
      const { id_token: idToken } = validate(googleSchema, req.body);
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw apiError(
          'google_unconfigured',
          'Google Sign-In is not configured (missing GOOGLE_CLIENT_ID)',
          501,
        );
      }
      const infoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!infoRes.ok) {
        throw apiError('invalid_google_token', 'Google token rejected', 401);
      }
      const info = await infoRes.json();
      if (info.aud !== clientId) {
        throw apiError('invalid_google_token', 'Google token audience mismatch', 401);
      }
      let user = db.prepare('SELECT id, email, role, display_name FROM users WHERE google_sub = ?').get(info.sub);
      if (!user) {
        const email = String(info.email || '').toLowerCase();
        const existing = email
          ? db.prepare('SELECT id, email, role, display_name FROM users WHERE email = ?').get(email)
          : null;
        if (existing) {
          // Never attach a Google identity to a non-owner account:
          // reject before persisting anything.
          if (existing.role !== 'owner') {
            throw apiError('forbidden', 'Google Sign-In is restricted to pet owners', 403);
          }
          db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(info.sub, existing.id);
          user = existing;
        } else {
          const created = db
            .prepare(
              "INSERT INTO users (email, role, google_sub, display_name) VALUES (?, 'owner', ?, ?) RETURNING id, email, role, display_name",
            )
            .get(email || `owner-${info.sub}@noemail.local`, info.sub, info.name || 'Owner');
          db.prepare('INSERT INTO owners (user_id) VALUES (?)').run(created.id);
          user = created;
        }
      }
      if (user.role !== 'owner') {
        throw apiError('forbidden', 'Google Sign-In is restricted to pet owners', 403);
      }
      const token = signToken({ id: user.id, email: user.email, role: user.role });
      res.json({ token, user });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, (req, res, next) => {
    try {
      const user = db
        .prepare('SELECT id, email, role, display_name FROM users WHERE id = ?')
        .get(req.user.sub);
      if (!user) throw apiError('not_found', 'User not found', 404);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAuthRoutes };
