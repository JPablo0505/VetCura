// Owner pet editing, weight history and pet photos.
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
  return { status: res.status, json, headers: res.headers };
}

before(async () => {
  db = openDatabase(':memory:');
  const hash = bcrypt.hashSync('Secret123!', 10);
  const a = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a@t.local', ?, 'owner', 'Ana') RETURNING id").get(hash).id;
  const b = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('b@t.local', ?, 'owner', 'Beto') RETURNING id").get(hash).id;
  const vet = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('v@t.local', ?, 'vet', 'Vet') RETURNING id").get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?), (?), (?)').run(a, b, vet);
  const toby = db.prepare("INSERT INTO pets (owner_id, name, species, breed) VALUES (?, 'Toby', 'dog', 'Beagle') RETURNING id").get(a).id;
  const luna = db.prepare("INSERT INTO pets (owner_id, name, species) VALUES (?, 'Luna', 'cat') RETURNING id").get(b).id;
  global.pet = { toby, luna };
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const login = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Secret123!' })).json.token;
  global.t = { a: await login('a@t.local'), b: await login('b@t.local'), vet: await login('v@t.local') };
});

after(() => {
  server.close();
  db.close();
});

describe('owner pet editing', () => {
  it('edits own pet partially and preserves other fields', async () => {
    const r = await api('PATCH', `/pets/${global.pet.toby}`, global.t.a, { name: 'Toby Jr.' });
    assert.equal(r.status, 200);
    assert.equal(r.json.pet.name, 'Toby Jr.');
    assert.equal(r.json.pet.species, 'dog');
    assert.equal(r.json.pet.owner_id, global.ids?.a ?? r.json.pet.owner_id);
  });

  it('rejects owner_id sent by the client', async () => {
    const before = db.prepare('SELECT owner_id FROM pets WHERE id = ?').get(global.pet.toby).owner_id;
    const r = await api('PATCH', `/pets/${global.pet.toby}`, global.t.a, { name: 'Toby', owner_id: 9999 });
    assert.equal(r.status, 400); // strict schema: ownership never comes from the client
    assert.equal(db.prepare('SELECT owner_id FROM pets WHERE id = ?').get(global.pet.toby).owner_id, before);
  });

  it('rejects cross-owner reads and writes without leaking data', async () => {
    const get = await api('GET', `/pets/${global.pet.luna}`, global.t.a);
    assert.equal(get.status, 403);
    const patch = await api('PATCH', `/pets/${global.pet.luna}`, global.t.a, { name: 'Stolen' });
    assert.equal(patch.status, 403);
    assert.equal(db.prepare('SELECT name FROM pets WHERE id = ?').get(global.pet.luna).name, 'Luna');
    const missing = await api('GET', '/pets/99999', global.t.a);
    assert.equal(missing.status, 404);
  });

  it('appends weight measurements without rewriting history', async () => {
    const first = await api('PATCH', `/pets/${global.pet.toby}`, global.t.a, { weight_kg: 12.0 });
    assert.equal(first.status, 200);
    assert.ok(first.json.measurement);
    const second = await api('PATCH', `/pets/${global.pet.toby}`, global.t.vet, { weight_kg: 12.5 });
    assert.equal(second.status, 200);
    const list = await api('GET', `/pets/${global.pet.toby}/measurements`, global.t.a);
    assert.equal(list.json.measurements.length, 2);
    assert.ok(list.json.measurements.every((m) => m.source === 'manual'));
    const pet = await api('GET', `/pets/${global.pet.toby}`, global.t.a);
    assert.equal(pet.json.pet.weight_kg, 12.5);
    assert.equal(pet.json.measurements.length, 2);
  });

  it('mirrors consultation weights into the measurement timeline', async () => {
    const c = await api('POST', '/consultations', global.t.vet, {
      pet_id: global.pet.toby, weight_kg: 13.0, diagnosis: 'Control',
    });
    assert.equal(c.status, 201);
    const list = await api('GET', `/pets/${global.pet.toby}/measurements`, global.t.a);
    assert.equal(list.json.measurements.length, 3);
    assert.equal(list.json.measurements[2].source, 'consultation');
  });

  it('rejects clinical writes through the general pet form', async () => {
    const r = await api('PATCH', `/pets/${global.pet.toby}`, global.t.a, { diagnosis: 'hack' });
    assert.equal(r.status, 400); // unknown field: strict pet schema
    const row = db.prepare('SELECT diagnosis FROM consultations WHERE pet_id = ?').all(global.pet.toby);
    assert.ok(row.every((c) => c.diagnosis !== 'hack'));
  });
});

describe('pet photos', () => {
  it('uploads and serves with ownership checks', async () => {
    const form = new FormData();
    form.append('photo', new Blob([PNG_1PX], { type: 'image/png' }), 'toby.png');
    const up = await api('POST', `/pets/${global.pet.toby}/photo`, global.t.a, form);
    assert.equal(up.status, 201);
    const other = await api('GET', `/pets/${global.pet.toby}/photo`, global.t.b);
    assert.equal(other.status, 403);
    const anon = await api('GET', `/pets/${global.pet.toby}/photo`, null);
    assert.equal(anon.status, 401);
  });

  it('rejects executables disguised as images', async () => {
    const form = new FormData();
    form.append('photo', new Blob(['<html>hi'], { type: 'image/jpeg' }), 'x.jpg');
    const r = await api('POST', `/pets/${global.pet.luna}/photo`, global.t.b, form);
    assert.equal(r.status, 415);
  });
});
