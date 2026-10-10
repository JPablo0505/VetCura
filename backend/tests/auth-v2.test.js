// Auth v0.2 tests: Google verification contract (stubbed verifier, no
// network), secure linking, refresh rotation, sessions, rate limiting.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../db');
const { createApp } = require('../src/app');
const { resetRateLimits } = require('../src/lib/rate-limit');

process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.JWT_SECRET = 'test-secret-v2';

let base;
let server;
let db;

function stubGoogle(cases) {
  return async (idToken) => {
    const entry = cases[idToken];
    if (!entry) {
      const e = new Error('rejected');
      e.code = 'invalid_google_token';
      throw e;
    }
    if (entry.throwCode) {
      const e = new Error(entry.throwCode);
      e.code = entry.throwCode;
      throw e;
    }
    return entry;
  };
}

const GOOGLE = {
  'valid-new-id-token': { sub: 'google-sub-1', email: 'newowner@example.com', email_verified: true, name: 'New Owner' },
  'valid-known-email-token': { sub: 'google-sub-2', email: 'o@t.local', email_verified: true, name: 'Owner' },
  'unverified-new-token': { sub: 'google-sub-3', email: 'shady@example.com', email_verified: false, name: 'Shady' },
  'expired-id-token': { throwCode: 'invalid_google_token' },
  'mismatch-mail-token': { sub: 'google-sub-4', email: 'someone-else@example.com', email_verified: true, name: 'Else' },
  'dupe-sub-id-token': { sub: 'google-sub-2', email: 'x@t.local', email_verified: true, name: 'Other' },
  'link-other-id-token': { sub: 'google-sub-9', email: 'x@t.local', email_verified: true, name: 'Other' },
  'claim-pending-token': { sub: 'google-sub-10', email: 'pending@example.com', email_verified: true, name: 'Pending' },
  'claim-unverified-token': { sub: 'google-sub-11', email: 'pending@example.com', email_verified: false, name: 'Pending' },
};

async function api(method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, headers: res.headers };
}

before(async () => {
  db = openDatabase(':memory:');
  const hash = bcrypt.hashSync('Secret123!', 10);
  const owner = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('o@t.local', ?, 'owner', 'Owner') RETURNING id")
    .get(hash).id;
  const other = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('x@t.local', ?, 'owner', 'Other') RETURNING id")
    .get(hash).id;
  const admin = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('admin@t.local', ?, 'admin', 'Admin') RETURNING id")
    .get(hash).id;
  const vet = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('v@t.local', ?, 'vet', 'Vet') RETURNING id")
    .get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?), (?), (?)').run(owner, other, vet);
  db.prepare("INSERT INTO pets (owner_id, name, species) VALUES (?, 'Toby', 'dog')").run(owner);
  global.ids = { owner, other, vet };
  const app = createApp(db, { googleVerify: stubGoogle(GOOGLE) });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const login = async (email) =>
    (await api('POST', '/auth/login', null, { email, password: 'Secret123!' })).json;
  global.tokens = {
    owner: await login('o@t.local'),
    other: await login('x@t.local'),
    vet: await login('v@t.local'),
    admin: await login('admin@t.local'),
  };
});

after(() => {
  server.close();
  db.close();
});

describe('google verification contract', () => {
  it('returns 501 when OAuth is unconfigured', async () => {
    const saved = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const r = await api('POST', '/auth/google', null, { id_token: 'whatever-token-value' });
      assert.equal(r.status, 501);
      assert.equal(r.json.error.code, 'google_unconfigured');
    } finally {
      process.env.GOOGLE_CLIENT_ID = saved;
    }
  });

  it('rejects invalid and expired tokens with 401', async () => {
    for (const t of ['nope-not-a-token-value', 'expired-id-token']) {
      const r = await api('POST', '/auth/google', null, { id_token: t });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'invalid_google_token');
    }
  });

  it('rejects unknown emails: closed registration, nothing created', async () => {
    const r = await api('POST', '/auth/google', null, { id_token: 'valid-new-id-token' });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'registration_required');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get('newowner@example.com');
    assert.equal(row, undefined);
  });

  it('claims a staff-registered pending account on first verified touch', async () => {
    const created = await api('POST', '/owners', global.tokens.admin.token, {
      display_name: 'Pending',
      email: 'pending@example.com',
    });
    assert.equal(created.status, 201);
    const r = await api('POST', '/auth/google', null, { id_token: 'claim-pending-token' });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, 'owner');
    assert.ok(r.json.token && r.json.refreshToken);
    const row = db.prepare('SELECT google_sub FROM users WHERE email = ?').get('pending@example.com');
    assert.equal(row.google_sub, 'google-sub-10');
    global.googleUserId = r.json.user.id;
  });

  it('logs in again through the linked sub', async () => {
    const r = await api('POST', '/auth/google', null, { id_token: 'claim-pending-token' });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.id, global.googleUserId);
  });

  it('rejects unverified tokens even for pending accounts', async () => {
    const r = await api('POST', '/auth/google', null, { id_token: 'claim-unverified-token' });
    assert.equal(r.status, 401);
    const row = db.prepare('SELECT google_sub FROM users WHERE email = ?').get('pending@example.com');
    assert.equal(row.google_sub, 'google-sub-10');
  });

  it('never auto-links a known email: 409 without persisting', async () => {
    const before = db.prepare('SELECT google_sub FROM users WHERE email = ?').get('o@t.local');
    assert.equal(before.google_sub, null);
    const r = await api('POST', '/auth/google', null, { id_token: 'valid-known-email-token' });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'link_verification_required');
    const after = db.prepare('SELECT google_sub FROM users WHERE email = ?').get('o@t.local');
    assert.equal(after.google_sub, null);
  });

  it('rejects unknown emails even when unverified (registration first)', async () => {
    const r = await api('POST', '/auth/google', null, { id_token: 'unverified-new-token' });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'registration_required');
  });
});

describe('google linking with proof of control', () => {
  it('links via own session when the verified email matches', async () => {
    const r = await api('PUT', '/auth/google/link', global.tokens.owner.token, { id_token: 'valid-known-email-token' });
    assert.equal(r.status, 200);
    assert.equal(r.json.linked, true);
    const row = db.prepare('SELECT google_sub FROM users WHERE email = ?').get('o@t.local');
    assert.equal(row.google_sub, 'google-sub-2');
  });

  it('rejects linking when the Google email does not match', async () => {
    const r = await api('PUT', '/auth/google/link', global.tokens.other.token, { id_token: 'mismatch-mail-token' });
    assert.equal(r.status, 401);
  });

  it('never converts staff roles through Google', async () => {
    const before = db.prepare('SELECT google_sub, role FROM users WHERE email = ?').get('v@t.local');
    const r = await api('PUT', '/auth/google/link', global.tokens.vet.token, { id_token: 'valid-new-id-token' });
    assert.equal(r.status, 403);
    const after = db.prepare('SELECT google_sub, role FROM users WHERE email = ?').get('v@t.local');
    assert.deepEqual(after, before);
  });

  it('rejects a sub already linked to another account with 409', async () => {
    const r = await api('POST', '/auth/google/link', null, {
      email: 'x@t.local',
      password: 'Secret123!',
      id_token: 'dupe-sub-id-token', // sub google-sub-1 belongs to newowner@example.com
    });
    assert.equal(r.status, 409);
  });

  it('links via password proof and returns a session', async () => {
    const r = await api('POST', '/auth/google/link', null, {
      email: 'x@t.local',
      password: 'Secret123!',
      id_token: 'link-other-id-token',
    });
    assert.equal(r.status, 200);
    assert.ok(r.json.token && r.json.refreshToken);
    const row = db.prepare('SELECT google_sub FROM users WHERE email = ?').get('x@t.local');
    assert.equal(row.google_sub, 'google-sub-9');
  });

  it('rejects password linking when the token belongs to another email', async () => {
    const r = await api('POST', '/auth/google/link', null, {
      email: 'x@t.local',
      password: 'Secret123!',
      id_token: 'mismatch-mail-token', // verified, but for someone-else@example.com
    });
    assert.equal(r.status, 401);
  });
});

describe('refresh rotation and sessions', () => {
  it('rotates refresh tokens and rejects the old one', async () => {
    const first = global.tokens.owner.refreshToken;
    const r = await api('POST', '/auth/refresh', null, { refresh_token: first });
    assert.equal(r.status, 200);
    assert.ok(r.json.token && r.json.refreshToken);
    assert.notEqual(r.json.refreshToken, first);
    const replay = await api('POST', '/auth/refresh', null, { refresh_token: first });
    assert.equal(replay.status, 401);
    global.rotated = r.json;
  });

  it('lists sessions without exposing hashes and revokes one', async () => {
    const list = await api('GET', '/auth/sessions', global.rotated.token);
    assert.equal(list.status, 200);
    assert.ok(list.json.sessions.length >= 1);
    assert.ok(!JSON.stringify(list.json.sessions).includes('token_hash'));
    const id = list.json.sessions[0].id;
    const del = await api('DELETE', `/auth/sessions/${id}`, global.rotated.token);
    assert.equal(del.status, 200);
    const replay = await api('POST', '/auth/refresh', null, { refresh_token: global.rotated.refreshToken });
    assert.equal(replay.status, 401);
  });

  it('logout revokes the presented refresh token', async () => {
    const login = await api('POST', '/auth/login', null, { email: 'o@t.local', password: 'Secret123!' });
    const out = await api('POST', '/auth/logout', null, { refresh_token: login.json.refreshToken });
    assert.equal(out.json.logged_out, true);
    const replay = await api('POST', '/auth/refresh', null, { refresh_token: login.json.refreshToken });
    assert.equal(replay.status, 401);
  });

  it('expired access tokens are rejected', async () => {
    const r = await api('GET', '/auth/me', 'expired-token-value');
    assert.equal(r.status, 401);
  });
});

describe('password storage and rate limiting', () => {
  it('never stores plaintext passwords (bcrypt hashes)', async () => {
    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('o@t.local');
    assert.ok(row.password_hash.startsWith('$2'));
    assert.ok(!row.password_hash.includes('Secret123!'));
  });

  it('rate-limits auth endpoints with 429 and Retry-After', async () => {
    resetRateLimits();
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    const app2 = createApp(db, { googleVerify: stubGoogle({}) });
    await new Promise((resolve) => {
      const s = app2.listen(0, () => {
        global.rateBase = `http://127.0.0.1:${s.address().port}`;
        global.rateServer2 = s;
        resolve();
      });
    });
    const hit = async () => {
      const res = await fetch(`${global.rateBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@t.local', password: 'wrong' }),
      });
      return { status: res.status, retry: res.headers.get('retry-after') };
    };
    try {
      assert.equal((await hit()).status, 401);
      assert.equal((await hit()).status, 401);
      const third = await hit();
      assert.equal(third.status, 429);
      assert.ok(third.retry);
    } finally {
      global.rateServer2.close();
      process.env.AUTH_RATE_LIMIT_MAX = '1000';
      resetRateLimits();
    }
  });
});
