// Clinical-plus: lab exams, visibility split, prescriptions, color.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../db');
const { createApp } = require('../src/app');

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('1 0 obj fake lab report\n')]);

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
  const isJson = ct.includes('json');
  const json = isJson ? await res.json().catch(() => null) : null;
  const buf = isJson ? null : Buffer.from(await res.arrayBuffer());
  return { status: res.status, json, buf, headers: res.headers };
}

before(async () => {
  db = openDatabase(':memory:');
  const hash = bcrypt.hashSync('Secret123!', 10);
  const vet = db.prepare("INSERT INTO users (email, password_hash, role, display_name, professional_id) VALUES ('v@t.local', ?, 'vet', 'Vet', 'MP-99999') RETURNING id").get(hash).id;
  const a = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a@t.local', ?, 'owner', 'Ana') RETURNING id").get(hash).id;
  const b = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('b@t.local', ?, 'owner', 'Beto') RETURNING id").get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?), (?)').run(a, b);
  const toby = db.prepare("INSERT INTO pets (owner_id, name, species, breed, color, sex) VALUES (?, 'Toby', 'dog', 'Beagle', 'Tricolor', 'male') RETURNING id").get(a).id;
  const luna = db.prepare("INSERT INTO pets (owner_id, name, species) VALUES (?, 'Luna', 'cat') RETURNING id").get(b).id;
  const consult = db.prepare("INSERT INTO consultations (pet_id, vet_user_id, diagnosis, client_summary) VALUES (?, ?, 'Secreto', 'Resumen generico') RETURNING id").get(toby, vet).id;
  global.ids = { vet, a, b, toby, luna, consult };
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const login = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Secret123!' })).json.token;
  global.t = { vet: await login('v@t.local'), a: await login('a@t.local'), b: await login('b@t.local') };
});

after(() => {
  server.close();
  db.close();
});

describe('lab exam PDFs', () => {
  it('attaches as staff, lists and downloads as owner', async () => {
    const form = new FormData();
    form.append('exam', new Blob([PDF], { type: 'application/pdf' }), 'hemograma.pdf');
    const up = await api('POST', `/consultations/${global.ids.consult}/exams`, global.t.vet, form);
    assert.equal(up.status, 201);
    assert.match(up.json.exam.filename, /^exam-\d+-\d+-\d+\.pdf$/);
    const list = await api('GET', `/consultations/${global.ids.consult}/exams`, global.t.a);
    assert.equal(list.json.exams.length, 1);
    const dl = await api('GET', `/consultations/${global.ids.consult}/exams/${up.json.exam.id}`, global.t.a);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get('content-type'), /application\/pdf/);
    assert.ok(dl.buf.slice(0, 5).toString() === '%PDF-');
  });

  it('rejects non-PDF by content and foreign pets', async () => {
    const form = new FormData();
    form.append('exam', new Blob(['MZ fake'], { type: 'application/pdf' }), 'x.pdf');
    const bad = await api('POST', `/consultations/${global.ids.consult}/exams`, global.t.vet, form);
    assert.equal(bad.status, 415);
    const other = await api('GET', `/consultations/${global.ids.consult}/exams`, global.t.b);
    assert.equal(other.status, 403);
    const anon = await api('GET', `/consultations/${global.ids.consult}/exams`, null);
    assert.equal(anon.status, 401);
  });
});

describe('visibility split', () => {
  it('hides internal detail from owners, keeps it for staff', async () => {
    const owner = await api('GET', `/pets/${global.ids.toby}/history`, global.t.a);
    const o = owner.json.consultations[0];
    assert.equal(o.client_summary, 'Resumen generico');
    for (const k of ['diagnosis', 'treatment', 'notes', 'internal_notes']) {
      assert.ok(!(k in o), `owner must not see ${k}`);
    }
    const staff = await api('GET', `/pets/${global.ids.toby}/history`, global.t.vet);
    assert.equal(staff.json.consultations[0].diagnosis, 'Secreto');
  });
});

describe('prescriptions', () => {
  it('computes units and orders items, once per consultation', async () => {
    const body = {
      recommendations: 'Pendiente ecografia',
      warning_signs: 'En caso de diarrea informar inmediatamente',
      recheck: 'En 1 semana',
      items: [
        { medication_name: 'Amoxicilina', form: 'tableta', strength_mg: 250, administration: '1 pastilla cada 24 h, con comida', qty_per_dose: 1, times_per_day: 1, duration_days: 4 },
        { medication_name: 'Suero', form: 'suero', administration: 'Via oral 10 ml cada 12 h', qty_per_dose: 10, times_per_day: 2, duration_days: 3 },
      ],
    };
    const r = await api('POST', `/consultations/${global.ids.consult}/prescription`, global.t.vet, body);
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.prescription.items.map((i) => [i.item_no, i.total_units]), [[1, 4], [2, 60]]);
    const dupe = await api('POST', `/consultations/${global.ids.consult}/prescription`, global.t.vet, body);
    assert.equal(dupe.status, 409);
    const bad = await api('POST', `/consultations/${global.ids.consult}/prescription`, global.t.vet, {
      items: [{ medication_name: 'X', form: 'tableta', administration: 'Y', qty_per_dose: 1, times_per_day: 0, duration_days: 1 }],
    });
    assert.equal(bad.status, 400);
  });

  it('is readable by the pet owner with header context, not by others', async () => {
    const r = await api('GET', `/consultations/${global.ids.consult}/prescription`, global.t.a);
    assert.equal(r.status, 200);
    assert.equal(r.json.prescription.pet_name, 'Toby');
    assert.equal(r.json.prescription.owner_name, 'Ana');
    assert.equal(r.json.prescription.vet_professional_id, 'MP-99999');
    assert.equal(r.json.prescription.recheck, 'En 1 semana');
    const other = await api('GET', `/consultations/${global.ids.consult}/prescription`, global.t.b);
    assert.equal(other.status, 403);
  });
});

describe('color and professional id', () => {
  it('stores color on create and patch, visible in reads', async () => {
    const created = await api('POST', '/pets', global.t.vet, {
      owner_id: global.ids.a, name: 'Sol', species: 'dog', color: 'Dorado y blanco',
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.pet.color, 'Dorado y blanco');
    const patched = await api('PATCH', `/pets/${created.json.pet.id}`, global.t.a, { color: 'Tricolor: negro, marron y blanco' });
    assert.equal(patched.json.pet.color, 'Tricolor: negro, marron y blanco');
  });
});
