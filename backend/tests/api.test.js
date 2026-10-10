// Backend integration tests: real HTTP against an ephemeral app + :memory: DB.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../db');
const { createApp } = require('../src/app');

let base;
let server;
let db;

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api(method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: token ? auth(token) : { 'Content-Type': 'application/json' },
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
  const admin = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('a@t.local', ?, 'admin', 'Admin') RETURNING id")
    .get(hash).id;
  const vet = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('v@t.local', ?, 'vet', 'Vet') RETURNING id")
    .get(hash).id;
  const owner = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('o@t.local', ?, 'owner', 'Owner') RETURNING id")
    .get(hash).id;
  const other = db
    .prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES ('x@t.local', ?, 'owner', 'Other') RETURNING id")
    .get(hash).id;
  db.prepare('INSERT INTO owners (user_id) VALUES (?), (?)').run(owner, other);
  db.prepare(
    "INSERT INTO pets (owner_id, name, species, breed, birthdate, sex) VALUES (?, 'Toby', 'dog', 'Beagle', '2022-05-01', 'male')",
  ).run(owner);
  db.prepare("INSERT INTO medications (name, kind, price_cents, stock) VALUES ('Vacuna X', 'drug', 2000, 10)").run();
  // Legacy booking tests use a vet: keep them on a wide-open schedule so
  // they exercise overlap/status logic; the hours guard is tested separately.
  for (let weekday = 0; weekday < 7; weekday += 1) {
    db.prepare('INSERT INTO vet_availability (vet_user_id, weekday, start_min, end_min) VALUES (?, ?, 0, 1440)').run(vet, weekday);
  }
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const adminLogin = await api('POST', '/auth/login', null, { email: 'a@t.local', password: 'Secret123!' });
  const vetLogin = await api('POST', '/auth/login', null, { email: 'v@t.local', password: 'Secret123!' });
  const ownerLogin = await api('POST', '/auth/login', null, { email: 'o@t.local', password: 'Secret123!' });
  const otherLogin = await api('POST', '/auth/login', null, { email: 'x@t.local', password: 'Secret123!' });
  global.tokens = {
    admin: adminLogin.json.token, vet: vetLogin.json.token,
    owner: ownerLogin.json.token, other: otherLogin.json.token,
    ids: { admin, vet, owner, other },
  };
});

after(() => {
  server.close();
  db.close();
});

describe('auth', () => {
  it('rejects bad credentials with 401', async () => {
    const r = await api('POST', '/auth/login', null, { email: 'a@t.local', password: 'nope' });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'invalid_credentials');
  });

  it('validates input with 400', async () => {
    const r = await api('POST', '/auth/login', null, { email: 'not-an-email', password: 'x' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'validation_error');
  });

  it('requires bearer token (401) and enforces roles (403)', async () => {
    const anon = await api('GET', '/pets', null);
    assert.equal(anon.status, 401);
    const forbidden = await api('GET', '/owners', global.tokens.owner);
    assert.equal(forbidden.status, 403);
  });

  it('google endpoint is honestly unavailable without credentials (501)', async () => {
    const r = await api('POST', '/auth/google', null, { id_token: 'fake-token-value' });
    assert.equal(r.status, 501);
    assert.equal(r.json.error.code, 'google_unconfigured');
  });

  it('me returns the current user', async () => {
    const r = await api('GET', '/auth/me', global.tokens.owner);
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, 'owner');
  });
});

describe('pets and owner scoping', () => {
  it('owner sees only their pets; other owner is forbidden', async () => {
    const mine = await api('GET', '/pets', global.tokens.owner);
    assert.equal(mine.json.pets.length, 1);
    const petId = mine.json.pets[0].id;
    const intruder = await api('GET', `/pets/${petId}`, global.tokens.other);
    assert.equal(intruder.status, 403);
    global.petId = petId;
  });

  it('rejects invalid pet payloads', async () => {
    const r = await api('POST', '/pets', global.tokens.admin, { owner_id: 9999, name: '', species: 'dog' });
    assert.equal(r.status, 400);
  });

  it('creates owners with a real email and rejects duplicates with 409', async () => {
    const created = await api('POST', '/owners', global.tokens.admin, {
      display_name: 'Nueva Propietaria',
      email: 'nueva@example.com',
      phone: '+34 600 999 888',
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.owner.email, 'nueva@example.com');
    const dupe = await api('POST', '/owners', global.tokens.admin, {
      display_name: 'Duplicada',
      email: 'nueva@example.com',
    });
    assert.equal(dupe.status, 409);
    assert.equal(dupe.json.error.code, 'conflict');
    const bad = await api('POST', '/owners', global.tokens.admin, {
      display_name: 'Mala',
      email: 'not-an-email',
    });
    assert.equal(bad.status, 400);
  });
});

describe('appointments', () => {
  it('books, then rejects overlapping vet slots with 409', async () => {
    const slot = {
      pet_id: global.petId,
      vet_user_id: global.tokens.ids.vet,
      starts_at: '2030-03-01T10:00:00.000Z',
      ends_at: '2030-03-01T10:30:00.000Z',
      reason: 'Checkup',
    };
    const first = await api('POST', '/appointments', global.tokens.owner, slot);
    assert.equal(first.status, 201);
    const clash = await api('POST', '/appointments', global.tokens.owner, {
      ...slot, starts_at: '2030-03-01T10:15:00.000Z', ends_at: '2030-03-01T10:45:00.000Z',
    });
    assert.equal(clash.status, 409);
    global.appointmentId = first.json.appointment.id;
  });

  it('enforces the status machine', async () => {
    const bad = await api('PATCH', `/appointments/${global.appointmentId}/status`, global.tokens.vet, { status: 'done' });
    assert.equal(bad.status, 409); // scheduled -> done is illegal
    const ok = await api('PATCH', `/appointments/${global.appointmentId}/status`, global.tokens.vet, { status: 'checked_in' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.appointment.status, 'checked_in');
  });

  it('owners cannot change appointment status', async () => {
    const r = await api('PATCH', `/appointments/${global.appointmentId}/status`, global.tokens.owner, { status: 'done' });
    assert.equal(r.status, 403);
  });
});

describe('clinical history and vaccination alerts', () => {
  it('records a consultation with allergies and updates weight', async () => {
    const r = await api('POST', '/consultations', global.tokens.vet, {
      appointment_id: global.appointmentId,
      pet_id: global.petId,
      weight_kg: 12.4,
      diagnosis: 'Otitis',
      allergies: ['Polen'],
    });
    assert.equal(r.status, 201);
    const history = await api('GET', `/pets/${global.petId}/history`, global.tokens.owner);
    assert.equal(history.json.consultations.length, 1);
    assert.deepEqual(history.json.consultations[0].allergies, ['Polen']);
    const weight = await api('GET', `/pets/${global.petId}/weight-history`, global.tokens.owner);
    assert.deepEqual(weight.json.history, [{ date: history.json.consultations[0].created_at, weight_kg: 12.4 }]);
  });

  it('surfaces overdue and upcoming vaccination alerts', async () => {
    await api('POST', '/vaccinations', global.tokens.vet, {
      pet_id: global.petId, vaccine: 'Rabia', due_date: '2020-01-01',
    });
    const upcoming = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    await api('POST', '/vaccinations', global.tokens.vet, {
      pet_id: global.petId, vaccine: 'Polivalente', due_date: upcoming,
    });
    const r = await api('GET', '/vaccinations/alerts', global.tokens.owner);
    assert.equal(r.status, 200);
    assert.ok(r.json.alerts.length >= 2);
    assert.ok(r.json.alerts.some((a) => a.overdue));
  });
});

describe('invoices with server-side totals', () => {
  it('ignores client totals and computes tax consistently', async () => {
    const created = await api('POST', '/invoices', global.tokens.admin, { pet_id: global.petId });
    assert.equal(created.status, 201);
    const id = created.json.invoice.id;
    // Catalog price resolves when the client omits the unit price…
    const catalogItem = await api('POST', `/invoices/${id}/items`, global.tokens.admin, {
      medication_id: 1, description: 'Vacuna X', qty: 2,
    });
    assert.equal(catalogItem.status, 201);
    assert.equal(catalogItem.json.invoice.items[0].unit_price_cents, 2000);
    // …and line totals are always recomputed server-side (qty x unit),
    // even when staff set an explicit price (discount).
    const discountItem = await api('POST', `/invoices/${id}/items`, global.tokens.admin, {
      description: 'Descuento consulta', qty: 1, unit_price_cents: 100,
    });
    assert.equal(discountItem.status, 201);
    const inv = discountItem.json.invoice;
    assert.equal(inv.items[1].line_total_cents, 100);
    assert.equal(inv.subtotal_cents, 4100);
    const { taxRate } = require('../src/routes/invoices');
    assert.equal(inv.tax_cents, Math.round(4100 * taxRate()));
    assert.equal(inv.total_cents, inv.subtotal_cents + inv.tax_cents);

    const issued = await api('PATCH', `/invoices/${id}/status`, global.tokens.admin, { status: 'issued' });
    assert.equal(issued.json.invoice.status, 'issued');
    const frozen = await api('POST', `/invoices/${id}/items`, global.tokens.admin, {
      description: 'Extra', qty: 1, unit_price_cents: 100,
    });
    assert.equal(frozen.status, 409); // issued invoices are immutable
    global.invoiceId = id;
  });

  it('owner reads their own invoice, not others', async () => {
    const mine = await api('GET', `/invoices/${global.invoiceId}`, global.tokens.owner);
    assert.equal(mine.status, 200);
    const intruder = await api('GET', `/invoices/${global.invoiceId}`, global.tokens.other);
    assert.equal(intruder.status, 403);
  });
});

describe('dashboard uses real data', () => {
  it('reflects issued revenue and appointment counts', async () => {
    const r = await api('GET', '/dashboard', global.tokens.admin);
    assert.ok(r.json.revenue_cents > 0);
    assert.ok(r.json.attended >= 0 && r.json.pending >= 0);
    assert.ok(Array.isArray(r.json.staff_performance));
  });
});
