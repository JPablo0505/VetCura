// Owner profile, preferences and photo upload tests.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../db');
const { createApp } = require('../src/app');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

let base;
let server;
let db;

async function api(method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const json = ct.includes('json') ? await res.json().catch(() => null) : null;
  const buf = ct.includes('json') ? null : Buffer.from(await res.arrayBuffer());
  return { status: res.status, json, buf, headers: res.headers };
}

before(async () => {
  db = openDatabase(':memory:');
  const hash = bcrypt.hashSync('Secret123!', 10);
  const a = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a@t.local', ?, 'owner', 'Ana') RETURNING id").get(hash).id;
  const b = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('b@t.local', ?, 'owner', 'Beto') RETURNING id").get(hash).id;
  const admin = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('admin@t.local', ?, 'admin', 'Admin') RETURNING id").get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?), (?), (?)').run(a, b, admin);
  global.ids = { a, b, admin };
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const login = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Secret123!' })).json.token;
  global.t = { a: await login('a@t.local'), b: await login('b@t.local'), admin: await login('admin@t.local') };
});

after(() => {
  server.close();
  db.close();
});

describe('owner profile', () => {
  it('reads own profile without secrets and with prefs', async () => {
    const r = await api('GET', '/me/profile', global.t.a);
    assert.equal(r.status, 200);
    assert.equal(r.json.profile.display_name, 'Ana');
    assert.ok(!('password_hash' in r.json.profile));
    assert.equal(r.json.profile.preferences.push_enabled, 1);
  });

  it('applies partial updates without losing other fields', async () => {
    const r = await api('PATCH', '/me/profile', global.t.a, { phone: '+57 300 111 2222' });
    assert.equal(r.status, 200);
    assert.equal(r.json.profile.phone, '+57 300 111 2222');
    assert.equal(r.json.profile.display_name, 'Ana');
    assert.equal(r.json.profile.address, null);
  });

  it('rejects role/email/id changes through the form', async () => {
    for (const body of [{ role: 'admin' }, { email: 'hacker@x.com' }, { user_id: 999 }]) {
      const r = await api('PATCH', '/me/profile', global.t.a, body);
      assert.equal(r.status, 400);
    }
    const row = db.prepare('SELECT role, email FROM users WHERE id = ?').get(global.ids.a);
    assert.deepEqual([row.role, row.email], ['owner', 'a@t.local']);
  });

  it('rejects invalid fields and cross-owner staff routes', async () => {
    const bad = await api('PATCH', '/me/profile', global.t.a, { display_name: '' });
    assert.equal(bad.status, 400);
    const cross = await api('PATCH', '/owners/9999', global.t.a, { phone: 'x' });
    assert.ok([403, 404].includes(cross.status));
    const other = await api('GET', `/owners/${global.ids.b}`, global.t.a);
    assert.equal(other.status, 403);
  });

  it('lets staff update owner data with audit trail', async () => {
    const r = await api('PATCH', `/owners/${global.ids.b}`, global.t.admin, { address: 'Calle 10 #5-20' });
    assert.equal(r.status, 200);
    assert.equal(r.json.profile.address, 'Calle 10 #5-20');
    const log = db.prepare("SELECT * FROM audit_log WHERE action = 'owner.profile.update' AND target_id = ?").get(global.ids.b);
    assert.ok(log && log.actor_user_id === global.ids.admin);
    assert.ok(!JSON.stringify(log).includes('Secret123!'));
  });
});

describe('owner photo', () => {
  it('accepts a real PNG, serves it back with auth', async () => {
    const form = new FormData();
    form.append('photo', new Blob([PNG_1PX], { type: 'image/png' }), 'avatar.png');
    const up = await api('POST', '/me/photo', global.t.a, form);
    assert.equal(up.status, 201);
    assert.match(up.json.photo, /^owner-\d+-\d+-\d+\.png$/);
    const got = await api('GET', '/me/photo', global.t.a);
    assert.equal(got.status, 200);
    assert.match(got.headers.get('content-type'), /image\/png/);
    assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(got.buf.equals(PNG_1PX));
  });

  it('rejects fake images by content, not extension', async () => {
    const form = new FormData();
    form.append('photo', new Blob(['not an image'], { type: 'image/png' }), 'evil.png');
    const r = await api('POST', '/me/photo', global.t.a, form);
    assert.equal(r.status, 415);
  });

  it('rejects oversized uploads with 413', async () => {
    const form = new FormData();
    form.append('photo', new Blob([Buffer.alloc(3 * 1024 * 1024, 65)]), 'big.jpg');
    const r = await api('POST', '/me/photo', global.t.a, form);
    assert.equal(r.status, 413);
  });
});

describe('notification preferences', () => {
  it('toggles one category without touching the others', async () => {
    const r = await api('PATCH', '/me/preferences', global.t.a, { push_enabled: false });
    assert.equal(r.status, 200);
    assert.equal(r.json.preferences.push_enabled, 0);
    assert.equal(r.json.preferences.email_enabled, 1);
    assert.equal(r.json.preferences.vaccination_reminders, 1);
  });

  it('rejects unknown preference keys', async () => {
    const r = await api('PATCH', '/me/preferences', global.t.a, { sms_enabled: true });
    assert.equal(r.status, 400);
  });
});
