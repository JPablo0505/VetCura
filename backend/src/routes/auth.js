const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { signToken, requireAuth } = require('../middleware/auth');
const { verifyGoogleToken, sha256hex } = require('../lib/google');
const { rateLimit } = require('../lib/rate-limit');
const { audit } = require('../lib/audit');

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
});

const googleSchema = z.object({
  id_token: z.string().min(10).max(8192),
});

const linkSchema = z.object({
  id_token: z.string().min(10).max(8192),
  email: z.string().email().max(255).optional(),
  password: z.string().min(1).max(255).optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(32).max(512),
});

const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

function issueRefreshToken(db, userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + REFRESH_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId, sha256hex(raw), expires,
  );
  return raw;
}

function publicUser(row) {
  return { id: row.id, email: row.email, role: row.role, display_name: row.display_name };
}

function attachGoogleSub(db, userId, sub) {
  try {
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(sub, userId);
  } catch (e) {
    if (e && e.code === 'ERR_SQLITE_ERROR' && /UNIQUE/i.test(e.message)) {
      throw apiError('conflict', 'This Google identity is already linked to another account', 409);
    }
    throw e;
  }
}

function buildAuthRoutes(db, options = {}) {
  const router = express.Router();
  const verifyFn = options.googleVerify;
  const sensitive = rateLimit({
    windowMs: 60000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
  });

  function sessionFor(user) {
    const token = signToken(user);
    const refreshToken = issueRefreshToken(db, user.id);
    return { token, refreshToken, user: publicUser(user) };
  }

  router.post('/login', sensitive, (req, res, next) => {
    try {
      const { email, password } = validate(loginSchema, req.body);
      const user = db
        .prepare('SELECT id, email, password_hash, role, display_name FROM users WHERE email = ?')
        .get(email);
      // Uniform message: no user enumeration.
      if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
        throw apiError('invalid_credentials', 'Invalid email or password', 401);
      }
      audit(db, { actor: user.id, action: 'auth.login', targetType: 'user', targetId: user.id });
      res.json(sessionFor(user));
    } catch (err) {
      next(err);
    }
  });

  // Google Sign-In. Secure policy (see odd/tasks/vetcura-v02*):
  // - token cryptographically verified (signature, issuer, expiry, audience);
  // - identity keyed by stable `sub`, never by email coincidence;
  // - a known email WITHOUT a linked sub is NOT auto-linked: the client
  //   gets 409 link_verification_required and must prove account control
  //   via PUT /auth/google/link (own session) or POST /auth/google/link
  //   (password proof). Staff/admin roles can never change through Google.
  router.post('/google', sensitive, async (req, res, next) => {
    try {
      const { id_token: idToken } = validate(googleSchema, req.body);
      const info = await verifyGoogleToken(idToken, verifyFn);
      const bySub = db
        .prepare('SELECT id, email, role, display_name FROM users WHERE google_sub = ?')
        .get(info.sub);
      if (bySub) {
        if (bySub.role !== 'owner') {
          throw apiError('forbidden', 'Google Sign-In is restricted to pet owners', 403);
        }
        audit(db, { actor: bySub.id, action: 'auth.login', targetType: 'user', targetId: bySub.id, meta: { provider: 'google' } });
        return res.json(sessionFor(bySub));
      }
      if (info.email) {
        const existing = db
          .prepare('SELECT id, role FROM users WHERE email = ?')
          .get(info.email);
        if (existing) {
          return res.status(409).json({
            error: {
              code: 'link_verification_required',
              message: 'An account with this email exists. Prove control of it to link Google Sign-In.',
            },
          });
        }
      }
      if (!info.email || !info.email_verified) {
        throw apiError('invalid_google_token', 'Google token rejected', 401);
      }
      const created = db
        .prepare(
          "INSERT INTO users (email, role, google_sub, display_name, email_verified_at) VALUES (?, 'owner', ?, ?, datetime('now')) RETURNING id, email, role, display_name",
        )
        .get(info.email, info.sub, info.name || 'Owner');
      db.prepare('INSERT INTO owners (user_id) VALUES (?)').run(created.id);
      db.prepare('INSERT INTO notification_prefs (user_id) VALUES (?)').run(created.id);
      audit(db, { actor: created.id, action: 'auth.google.signup', targetType: 'user', targetId: created.id });
      return res.json(sessionFor(created));
    } catch (err) {
      return next(err);
    }
  });

  // Link Google to the CALLER's own account (Bearer session = proof of control).
  router.put('/google/link', sensitive, requireAuth, async (req, res, next) => {
    try {
      const { id_token: idToken } = validate(googleSchema, req.body);
      const info = await verifyGoogleToken(idToken, verifyFn);
      const me = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.user.sub);
      if (!me) throw apiError('not_found', 'User not found', 404);
      if (me.role !== 'owner') {
        throw apiError('forbidden', 'Google Sign-In is restricted to pet owners', 403);
      }
      if (!info.email_verified || info.email !== me.email.toLowerCase()) {
        throw apiError('invalid_google_token', 'Google identity does not match this account', 401);
      }
      attachGoogleSub(db, me.id, info.sub);
      db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime(\'now\')) WHERE id = ?').run(me.id);
      audit(db, { actor: me.id, action: 'auth.google.link', targetType: 'user', targetId: me.id });
      return res.json({ linked: true });
    } catch (err) {
      return next(err);
    }
  });

  // Link Google with password proof (no session): {email, password, id_token}.
  router.post('/google/link', sensitive, async (req, res, next) => {
    try {
      const body = validate(linkSchema, req.body);
      if (!body.email || !body.password) {
        throw apiError('validation_error', 'email and password are required to link', 400);
      }
      const user = db.prepare('SELECT id, email, password_hash, role FROM users WHERE email = ?').get(body.email);
      if (!user || !user.password_hash || !bcrypt.compareSync(body.password, user.password_hash)) {
        throw apiError('invalid_credentials', 'Invalid email or password', 401);
      }
      if (user.role !== 'owner') {
        throw apiError('forbidden', 'Google Sign-In is restricted to pet owners', 403);
      }
      const info = await verifyGoogleToken(body.id_token, verifyFn);
      if (!info.email_verified || info.email !== user.email.toLowerCase()) {
        throw apiError('invalid_google_token', 'Google identity does not match this account', 401);
      }
      attachGoogleSub(db, user.id, info.sub);
      db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime(\'now\')) WHERE id = ?').run(user.id);
      audit(db, { actor: user.id, action: 'auth.google.link', targetType: 'user', targetId: user.id });
      const full = db.prepare('SELECT id, email, role, display_name FROM users WHERE id = ?').get(user.id);
      return res.json(sessionFor(full));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/refresh', sensitive, (req, res, next) => {
    try {
      const { refresh_token: raw } = validate(refreshSchema, req.body);
      const row = db.prepare('SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?').get(sha256hex(raw));
      if (!row || row.revoked_at || row.expires_at < new Date().toISOString()) {
        throw apiError('unauthorized', 'Refresh token invalid or expired', 401);
      }
      const user = db.prepare('SELECT id, email, role, display_name FROM users WHERE id = ?').get(row.user_id);
      if (!user) throw apiError('unauthorized', 'Refresh token invalid or expired', 401);
      db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?").run(row.id);
      return res.json(sessionFor(user));
    } catch (err) {
      return next(err);
    }
  });

  // Logout revokes sessions. With {refresh_token} only that session is
  // revoked; with a Bearer token and no body, all own sessions are revoked.
  router.post('/logout', (req, res, next) => {
    try {
      const parsed = refreshSchema.safeParse(req.body || {});
      if (parsed.success) {
        db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\') WHERE token_hash = ? AND revoked_at IS NULL').run(
          sha256hex(parsed.data.refresh_token),
        );
        return res.json({ logged_out: true });
      }
      const header = req.headers.authorization || '';
      if (header.startsWith('Bearer ')) {
        const payload = jwt.verify(
          header.slice(7),
          process.env.JWT_SECRET || 'change-me-in-production',
          { ignoreExpiration: true },
        );
        db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\') WHERE user_id = ? AND revoked_at IS NULL').run(payload.sub);
        audit(db, { actor: payload.sub, action: 'auth.logout', targetType: 'user', targetId: payload.sub });
      }
      return res.json({ logged_out: true });
    } catch (err) {
      return next(err);
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

  router.get('/sessions', requireAuth, (req, res, next) => {
    try {
      const rows = db
        .prepare('SELECT id, created_at, expires_at FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > datetime(\'now\') ORDER BY created_at DESC')
        .all(req.user.sub);
      res.json({ sessions: rows });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/sessions/:id', requireAuth, (req, res, next) => {
    try {
      db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(
        Number(req.params.id), req.user.sub,
      );
      res.json({ revoked: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAuthRoutes, issueRefreshToken };
