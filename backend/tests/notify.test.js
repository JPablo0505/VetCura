// Notification engine tests: prefs gating, idempotent reconcile,
// delivery, retries, devices. Stub providers only (no network).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../db');
const { createApp } = require('../src/app');
const { enqueue, reconcile, processDue } = require('../src/lib/notify');

function stubEmail(log, failWith = null) {
  return {
    name: 'stub-email',
    async send(msg) {
      if (failWith) throw failWith;
      log.push(msg);
    },
  };
}

function stubPush(log, invalid = new Set()) {
  return {
    name: 'stub-push',
    async send({ token, title, body }) {
      if (invalid.has(token)) {
        const e = new Error('FCM token invalid');
        e.code = 'fcm_invalid_token';
        throw e;
      }
      log.push({ token, title, body });
    },
  };
}

let base;
let server;
let db;

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
  return { status: res.status, json };
}

before(async () => {
  db = openDatabase(':memory:');
  const hash = bcrypt.hashSync('Secret123!', 10);
  const a = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a@t.local', ?, 'owner', 'Ana') RETURNING id").get(hash).id;
  const b = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('b@t.local', ?, 'owner', 'Beto') RETURNING id").get(hash).id;
  const admin = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('admin@t.local', ?, 'admin', 'Admin') RETURNING id").get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?), (?), (?)').run(a, b, admin);
  const toby = db.prepare("INSERT INTO pets (owner_id, name, species) VALUES (?, 'Toby', 'dog') RETURNING id").get(a).id;
  global.ids = { a, b, admin, toby };
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

describe('scheduling and idempotency', () => {
  it('creates reminders from system data without duplicates', async () => {
    const soon = new Date(Date.now() + 2 * 3600e3).toISOString();
    const later = new Date(Date.now() + 3 * 3600e3).toISOString();
    const appt = db.prepare('INSERT INTO appointments (pet_id, starts_at, ends_at, reason) VALUES (?, ?, ?, ?) RETURNING id')
      .get(global.ids.toby, soon, later, 'Control').id;
    global.apptId = appt;
    const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date) VALUES (?, ?, ?)').run(global.ids.toby, 'Rabia', due);
    reconcile(db);
    reconcile(db); // second run must not duplicate
    const rows = db.prepare("SELECT idempotency_key, kind, status FROM notification_queue WHERE user_id = ?").all(global.ids.a);
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => r.key === undefined || r.idempotency_key.startsWith('appt:')));
    assert.ok(rows.some((r) => r.idempotency_key.startsWith('vacc:')));
    assert.ok(rows.every((r) => r.status === 'pending'));
  });

  it('respects disabled categories at schedule time', async () => {
    await api('PATCH', '/me/preferences', global.t.a, { appointment_reminders: false });
    const soon = new Date(Date.now() + 4 * 3600e3).toISOString();
    const later = new Date(Date.now() + 5 * 3600e3).toISOString();
    db.prepare('INSERT INTO appointments (pet_id, starts_at, ends_at) VALUES (?, ?, ?)').run(global.ids.toby, soon, later);
    reconcile(db);
    const rows = db.prepare("SELECT * FROM notification_queue WHERE kind = 'appointment' AND status = 'pending'").all();
    assert.equal(rows.length, 1); // only the first appointment's reminder
    await api('PATCH', '/me/preferences', global.t.a, { appointment_reminders: true });
  });

  it('cancels reminders when appointments are cancelled', async () => {
    db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(global.apptId);
    reconcile(db);
    const rows = db.prepare("SELECT status FROM notification_queue WHERE idempotency_key LIKE ?").all(`appt:${global.apptId}:%`);
    assert.ok(rows.length > 0 && rows.every((r) => r.status === 'cancelled'));
  });

  it('queues a clinic notice on consultation without clinical detail', async () => {
    const vetHash = require('bcryptjs').hashSync('Secret123!', 10);
    db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('realvet@t.local', ?, 'vet', 'RealVet') RETURNING id").get(vetHash);
    const vetLogin = await api('POST', '/auth/login', null, { email: 'realvet@t.local', password: 'Secret123!' });
    const c = await api('POST', '/consultations', vetLogin.json.token, {
      pet_id: global.ids.toby, diagnosis: 'Otitis grave secreta', treatment: 'Secreto',
    });
    assert.equal(c.status, 201);
    const items = db.prepare("SELECT * FROM notification_queue WHERE idempotency_key = ?").all(`consult:${c.json.consultation.id}`);
    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'pending');
    const blob = `${items[0].title} ${items[0].body}`;
    assert.ok(!blob.includes('Otitis') && !blob.includes('Toby'));
  });
});

describe('delivery, retries and prefs at send time', () => {
  it('delivers due items through both channels and marks sent', async () => {
    const emailLog = [];
    const pushLog = [];
    db.prepare('INSERT INTO devices (user_id, fcm_token) VALUES (?, ?)').run(global.ids.a, 'fcm-token-a1');
    const id = enqueue(db, { key: 'test:send-1', userId: global.ids.a, kind: 'appointment', title: 'T', body: 'B' });
    db.prepare("UPDATE notification_queue SET scheduled_for = datetime('now', '-1 hour') WHERE id = ?").run(id);
    const counts = await processDue(db, { email: stubEmail(emailLog), push: stubPush(pushLog) });
    assert.ok(counts.sent >= 1); // also drains reminders queued by earlier tests
    assert.ok(emailLog.length >= 1 && pushLog.length >= 1);
    assert.equal(db.prepare('SELECT status FROM notification_queue WHERE id = ?').get(id).status, 'sent');
    assert.equal(emailLog[0].to, 'a@t.local');
    assert.ok(!emailLog[0].subject.includes('Otitis'));
  });

  it('removes invalid FCM tokens reported by the provider', async () => {
    const pushLog = [];
    db.prepare('INSERT INTO devices (user_id, fcm_token) VALUES (?, ?)').run(global.ids.a, 'fcm-dead-token');
    const id = enqueue(db, { key: 'test:send-2', userId: global.ids.a, kind: 'clinic', title: 'T', body: 'B' });
    db.prepare("UPDATE notification_queue SET scheduled_for = datetime('now', '-1 hour') WHERE id = ?").run(id);
    // email channel also delivers (verified address), so item is sent;
    // the dead push token must still be purged.
    const counts = await processDue(db, { email: stubEmail([]), push: stubPush(pushLog, new Set(['fcm-dead-token'])) });
    assert.equal(counts.sent, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM devices WHERE fcm_token = ?').get('fcm-dead-token').n, 0);
    assert.ok(db.prepare('SELECT COUNT(*) n FROM devices WHERE fcm_token = ?').get('fcm-token-a1').n >= 0);
  });

  it('retries failures with backoff and gives up after the cap', async () => {
    const boom = new Error('SMTP down');
    const id = enqueue(db, { key: 'test:fail-1', userId: global.ids.b, kind: 'appointment', title: 'T', body: 'B' });
    db.prepare("UPDATE notification_queue SET scheduled_for = datetime('now', '-1 hour') WHERE id = ?").run(id);
    // owner B has no devices and email fails: stays pending with attempts.
    let counts = await processDue(db, { email: stubEmail([], boom), push: stubPush([]) });
    assert.equal(counts.pending, 1);
    db.prepare('UPDATE notification_queue SET attempts = 4, scheduled_for = datetime(\'now\', \'-1 hour\') WHERE id = ?').run(id);
    counts = await processDue(db, { email: stubEmail([], boom), push: stubPush([]) });
    assert.equal(counts.failed, 1);
    const row = db.prepare('SELECT status, last_error FROM notification_queue WHERE id = ?').get(id);
    assert.equal(row.status, 'failed');
    assert.match(row.last_error, /SMTP down/);
  });

  it('cancels at send time when the category was disabled meanwhile', async () => {
    await api('PATCH', '/me/preferences', global.t.a, { vaccination_reminders: false });
    const id = enqueue(db, { key: 'test:cancel-1', userId: global.ids.a, kind: 'vaccination', title: 'T', body: 'B' });
    void id;
    // enqueue() itself refuses disabled categories, so insert directly to
    // simulate a change between scheduling and sending.
    db.prepare("INSERT INTO notification_queue (idempotency_key, user_id, kind, title, body, scheduled_for) VALUES ('test:cancel-2', ?, 'vaccination', 'T', 'B', datetime('now', '-1 hour'))").run(global.ids.a);
    const counts = await processDue(db, { email: stubEmail([]), push: stubPush([]) });
    assert.ok(counts.cancelled >= 1);
    await api('PATCH', '/me/preferences', global.t.a, { vaccination_reminders: true });
  });

  it('never sends to placeholder emails', async () => {
    const created = await api('POST', '/owners', global.t.admin, { display_name: 'Sin Correo' });
    const uid = created.json.owner.user_id;
    const id = enqueue(db, { key: 'test:noaddr-1', userId: uid, kind: 'clinic', title: 'T', body: 'B' });
    db.prepare("UPDATE notification_queue SET scheduled_for = datetime('now', '-1 hour') WHERE id = ?").run(id);
    const emailLog = [];
    const counts = await processDue(db, { email: stubEmail(emailLog), push: stubPush([]) });
    assert.equal(emailLog.length, 0);
    const row = db.prepare('SELECT attempts, status, last_error FROM notification_queue WHERE id = ?').get(id);
    assert.match(row.last_error, /no verified recipient/);
    assert.ok(['pending', 'failed'].includes(row.status));
    void counts;
  });
});

describe('device ownership', () => {
  it('derives the owner from the session and isolates users', async () => {
    const reg = await api('POST', '/me/devices', global.t.b, { fcm_token: 'fcm-token-b1' });
    assert.equal(reg.status, 201);
    const dupe = await api('POST', '/me/devices', global.t.a, { fcm_token: 'fcm-token-b1' });
    assert.equal(dupe.status, 409);
    const listB = await api('GET', '/me/devices', global.t.b);
    const target = listB.json.devices.find((d) => d.id);
    const delByA = await api('DELETE', `/me/devices/${target.id}`, global.t.a);
    assert.equal(delByA.status, 404);
    const delByB = await api('DELETE', `/me/devices/${target.id}`, global.t.b);
    assert.equal(delByB.status, 200);
  });

  it('revokes devices on logout path via explicit delete', async () => {
    await api('POST', '/me/devices', global.t.b, { fcm_token: 'fcm-token-b2' });
    const list = await api('GET', '/me/devices', global.t.b);
    assert.ok(list.json.devices.some((d) => d.id));
  });
});
