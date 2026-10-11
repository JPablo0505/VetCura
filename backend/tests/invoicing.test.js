// Formal invoicing: numbers, owner self-payment, clinic header.
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

async function draftInvoice(token, petId, items = [{ description: 'Consulta', qty: 1, unit_price_cents: 60000 }]) {
  const created = await api('POST', '/invoices', token, { pet_id: petId });
  assert.equal(created.status, 201);
  for (const item of items) {
    const added = await api('POST', `/invoices/${created.json.invoice.id}/items`, token, item);
    assert.equal(added.status, 201);
  }
  return created.json.invoice.id;
}

before(async () => {
  db = openDatabase(':memory:');
  const hash = bcrypt.hashSync('Secret123!', 10);
  const admin = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a@t.local', ?, 'admin', 'Admin') RETURNING id").get(hash).id;
  const a = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a-owner@t.local', ?, 'owner', 'Ana') RETURNING id").get(hash).id;
  const b = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('b-owner@t.local', ?, 'owner', 'Beto') RETURNING id").get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?), (?)').run(a, b);
  const petA = db.prepare("INSERT INTO pets (owner_id, name, species) VALUES (?, 'Toby', 'dog') RETURNING id").get(a).id;
  const petB = db.prepare("INSERT INTO pets (owner_id, name, species) VALUES (?, 'Luna', 'cat') RETURNING id").get(b).id;
  global.ids = { admin, a, b, petA, petB };
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const login = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Secret123!' })).json.token;
  global.t = { admin: await login('a@t.local'), a: await login('a-owner@t.local'), b: await login('b-owner@t.local') };
});

after(() => {
  server.close();
  db.close();
});

describe('numbered issuing', () => {
  it('assigns sequential FV numbers once, at issue', async () => {
    const id1 = await draftInvoice(global.t.admin, global.ids.petA);
    const id2 = await draftInvoice(global.t.admin, global.ids.petA);
    const draft = await api('GET', `/invoices/${id1}`, global.t.admin);
    assert.equal(draft.json.invoice.number, null);
    const first = await api('PATCH', `/invoices/${id1}/status`, global.t.admin, { status: 'issued' });
    assert.match(first.json.invoice.number, /^FV-\d{4}$/);
    const second = await api('PATCH', `/invoices/${id2}/status`, global.t.admin, { status: 'issued' });
    assert.ok(second.json.invoice.number > first.json.invoice.number);
    assert.ok(second.json.invoice.owner_name && second.json.invoice.pet_name);
    global.issued = [id1, id2];
  });

  it('notifies the owner on issue with a minimal payload', async () => {
    const rows = db.prepare('SELECT title, body FROM notification_queue WHERE idempotency_key = ?').all(`invoice:${global.issued[0]}`);
    assert.equal(rows.length, 1);
    const blob = `${rows[0].title} ${rows[0].body}`;
    assert.ok(!blob.includes('60000') && blob.toLowerCase().includes('factura'));
  });
});

describe('owner self-payment', () => {
  it('pays own issued invoice with method and timestamp', async () => {
    const r = await api('POST', `/invoices/${global.issued[0]}/pay`, global.t.a, { payment_method: 'efectivo' });
    assert.equal(r.status, 200);
    assert.equal(r.json.invoice.status, 'paid');
    assert.equal(r.json.invoice.payment_method, 'efectivo');
    assert.ok(r.json.invoice.paid_at);
  });

  it('rejects double pay, draft pay and foreign invoices', async () => {
    const again = await api('POST', `/invoices/${global.issued[0]}/pay`, global.t.a, { payment_method: 'tarjeta' });
    assert.equal(again.status, 409);
    const draftId = await draftInvoice(global.t.admin, global.ids.petA);
    const draftPay = await api('POST', `/invoices/${draftId}/pay`, global.t.a, { payment_method: 'efectivo' });
    assert.equal(draftPay.status, 409);
    const foreign = await api('POST', `/invoices/${global.issued[1]}/pay`, global.t.b, { payment_method: 'efectivo' });
    assert.equal(foreign.status, 403);
    global.draftId = draftId;
  });

  it('validates the payment method', async () => {
    const r = await api('POST', `/invoices/${global.draftId}/pay`, global.t.a, { payment_method: 'bitcoin' });
    assert.equal(r.status, 400);
  });

  it('lets staff pay through the same route', async () => {
    const r = await api('POST', `/invoices/${global.issued[1]}/pay`, global.t.admin, { payment_method: 'transferencia' });
    assert.equal(r.status, 200);
    assert.equal(r.json.invoice.status, 'paid');
  });
});

describe('receipt header', () => {
  it('serves clinic data for the formal receipt', async () => {
    const r = await api('GET', '/clinic', global.t.a);
    assert.equal(r.status, 200);
    assert.ok(r.json.clinic.name && r.json.clinic.nit);
  });

  it('attributes the attending vet and rejects non-vets', async () => {
    const noVet = await api('POST', '/invoices', global.t.admin, { pet_id: global.ids.petA, vet_user_id: 9999 });
    assert.equal(noVet.status, 404);
    const vetId = db.prepare("INSERT INTO users (email, role, display_name) VALUES ('vetx@t.local', 'vet', 'Vet X') RETURNING id").get().id;
    const ok = await api('POST', '/invoices', global.t.admin, { pet_id: global.ids.petA, vet_user_id: vetId });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.invoice.vet_name, 'Vet X');
  });
});
