// Vet availability, free slots and booking enforcement.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../db');
const { createApp } = require('../src/app');

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
  const admin = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a@t.local', ?, 'admin', 'Admin') RETURNING id").get(hash).id;
  const vet = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('v@t.local', ?, 'vet', 'Vet') RETURNING id").get(hash).id;
  const owner = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('o@t.local', ?, 'owner', 'Owner') RETURNING id").get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?)').run(owner);
  const pet = db.prepare("INSERT INTO pets (owner_id, name, species) VALUES (?, 'Toby', 'dog') RETURNING id").get(owner).id;
  global.ids = { admin, vet, owner, pet };
  // Vet works Mondays 09:00–12:00 only.
  db.prepare('INSERT INTO vet_availability (vet_user_id, weekday, start_min, end_min) VALUES (?, 1, 540, 720)').run(vet);
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const login = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Secret123!' })).json.token;
  global.t = { admin: await login('a@t.local'), vet: await login('v@t.local'), owner: await login('o@t.local') };
});

after(() => {
  server.close();
  db.close();
});

// 2030-03-04 is a Monday (verified getUTCDay() === 1).
const MONDAY = '2030-03-04';

describe('availability management', () => {
  it('lists ranges for staff and rejects bad input', async () => {
    const r = await api('GET', `/vets/${global.ids.vet}/availability`, global.t.admin);
    assert.equal(r.status, 200);
    assert.equal(r.json.availability.length, 1);
    const bad = await api('POST', `/vets/${global.ids.vet}/availability`, global.t.admin, { weekday: 9, start: '09:00', end: '08:00' });
    assert.equal(bad.status, 400);
    const dupe = await api('POST', `/vets/${global.ids.vet}/availability`, global.t.admin, { weekday: 1, start: '09:00', end: '10:00' });
    assert.equal(dupe.status, 409);
  });

  it('requires staff roles and known vets', async () => {
    const forbidden = await api('GET', `/vets/${global.ids.vet}/availability`, global.t.owner);
    assert.equal(forbidden.status, 403);
    const missing = await api('GET', '/vets/9999/slots?date=2030-03-03', global.t.owner);
    assert.equal(missing.status, 404);
    const removed = await api('DELETE', '/availability/9999', global.t.admin);
    assert.equal(removed.status, 404);
  });

  it('adds and removes ranges', async () => {
    const add = await api('POST', `/vets/${global.ids.vet}/availability`, global.t.admin, { weekday: 3, start: '14:00', end: '18:00' });
    assert.equal(add.status, 201);
    const del = await api('DELETE', `/availability/${add.json.availability.id}`, global.t.admin);
    assert.equal(del.status, 200);
  });
});

describe('free slots and booking guard', () => {
  it('offers Monday morning slots and excludes booked ones', async () => {
    const before = await api('GET', `/vets/${global.ids.vet}/slots?date=${MONDAY}`, global.t.owner);
    assert.equal(before.status, 200);
    assert.equal(before.json.slots.length, 6); // 09:00–12:00 in 30-min steps
    assert.equal(before.json.slots[0].starts_at, `${MONDAY}T09:00:00.000Z`);
    const booked = await api('POST', '/appointments', global.t.owner, {
      pet_id: global.ids.pet,
      vet_user_id: global.ids.vet,
      starts_at: `${MONDAY}T09:30:00.000Z`,
      ends_at: `${MONDAY}T10:00:00.000Z`,
      reason: 'Control',
    });
    assert.equal(booked.status, 201);
    const after = await api('GET', `/vets/${global.ids.vet}/slots?date=${MONDAY}`, global.t.owner);
    assert.equal(after.json.slots.length, 5);
    assert.ok(after.json.slots.every((s) => s.starts_at !== `${MONDAY}T09:30:00.000Z`));
  });

  it('rejects bookings outside working hours with 409', async () => {
    const r = await api('POST', '/appointments', global.t.owner, {
      pet_id: global.ids.pet,
      vet_user_id: global.ids.vet,
      starts_at: `${MONDAY}T14:00:00.000Z`,
      ends_at: `${MONDAY}T14:30:00.000Z`,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'unavailable');
  });

  it('returns no slots on days without availability', async () => {
    const r = await api('GET', `/vets/${global.ids.vet}/slots?date=2030-03-05`, global.t.owner); // Tuesday
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.slots, []);
  });
});
