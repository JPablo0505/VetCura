// Controlled seed data for local development and demos.
// Credentials are development-only placeholders, never production secrets.
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../db');
const { runInTransaction } = require('../src/lib/transaction');
const { recomputeTotals } = require('../src/routes/invoices');

const dbPath = process.env.DATABASE_PATH || './data/vetcura.db';
const db = openDatabase(dbPath);

const password = bcrypt.hashSync('VetCura123!', 10);

function user(email, role, displayName) {
  return db
    .prepare(
      'INSERT INTO users (email, password_hash, role, display_name) VALUES (?, ?, ?, ?) RETURNING id',
    )
    .get(email, password, role, displayName).id;
}

function main() {
  const exists = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (exists > 0) {
    console.log('Seed skipped: users already exist');
    return;
  }
  const admin = user('admin@vetcura.local', 'admin', 'Admin');
  const vet = user('vet@vetcura.local', 'vet', 'Dr. Rivera');
  user('staff@vetcura.local', 'staff', 'Recepcion');
  const owner1 = user('lucia@example.com', 'owner', 'Lucia Gomez');
  const owner2 = user('marco@example.com', 'owner', 'Marco Ruiz');
  // Demo owner WITH password for on-device testing (dev only — the two
  // owners above sign in via Google linking once OAuth is configured).
  const demo = db
    .prepare(
      "INSERT INTO users (email, password_hash, role, display_name) VALUES ('demo@vetcura.local', ?, 'owner', 'Demo Owner') RETURNING id",
    )
    .get(password).id;
  db.prepare('INSERT INTO owners (user_id, phone) VALUES (?, ?)').run(demo, '+34 600 000 001');
  const firulais = db
    .prepare(
      "INSERT INTO pets (owner_id, name, species, breed, birthdate, sex, weight_kg) VALUES (?, 'Firulais', 'dog', 'Mestizo', '2022-09-01', 'male', 15.0) RETURNING id",
    )
    .get(demo).id;
  db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date) VALUES (?, ?, ?)').run(
    firulais, 'Rabia', new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
  );
  db.prepare('INSERT INTO owners (user_id, phone) VALUES (?, ?)').run(owner1, '+34 600 111 222');
  db.prepare('INSERT INTO owners (user_id, phone) VALUES (?, ?)').run(owner2, '+34 600 333 444');

  const rocky = db
    .prepare(
      "INSERT INTO pets (owner_id, name, species, breed, birthdate, sex, weight_kg) VALUES (?, 'Rocky', 'dog', 'Labrador', '2021-04-12', 'male', 28.5) RETURNING id",
    )
    .get(owner1).id;
  const misu = db
    .prepare(
      "INSERT INTO pets (owner_id, name, species, breed, birthdate, sex, weight_kg) VALUES (?, 'Misu', 'cat', 'Siames', '2023-01-05', 'female', 4.2) RETURNING id",
    )
    .get(owner2).id;

  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    'INSERT INTO vaccinations (pet_id, vaccine, due_date, given_date) VALUES (?, ?, ?, ?)',
  ).run(rocky, 'Rabia', '2024-06-01', '2024-06-01'); // historical
  db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date) VALUES (?, ?, ?)').run(
    rocky, 'Polivalente', '2020-01-01',
  ); // overdue alert
  db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date) VALUES (?, ?, ?)').run(
    misu, 'Leucemia felina', today,
  ); // upcoming alert

  db.prepare(
    `INSERT INTO medications (name, kind, price_cents, stock) VALUES
     ('Amoxicilina 250mg', 'drug', 1250, 40),
     ('Vacuna polivalente', 'drug', 2800, 25),
     ('Jeringa 5ml', 'supply', 120, 200)`,
  ).run();

  const appt = db
    .prepare(
      `INSERT INTO appointments (pet_id, vet_user_id, starts_at, ends_at, status, reason)
       VALUES (?, ?, datetime('now', '-2 days'), datetime('now', '-2 days', '+30 minutes'), 'done', 'Revision anual')`,
    )
    .run(rocky, vet).lastInsertRowid;
  const consult = db
    .prepare(
      `INSERT INTO consultations (appointment_id, pet_id, vet_user_id, weight_kg, diagnosis, treatment)
       VALUES (?, ?, ?, 28.5, 'Otitis externa leve', 'Limpieza otica + antibiotico topico 7 dias')`,
    )
    .run(appt, rocky, vet).lastInsertRowid;
  db.prepare('INSERT INTO consultation_allergies (consultation_id, allergy) VALUES (?, ?)').run(
    consult, 'Polen',
  );

  const inv = db
    .prepare("INSERT INTO invoices (pet_id, owner_id, status) VALUES (?, ?, 'draft')")
    .run(rocky, owner1).lastInsertRowid;
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, medication_id, description, qty, unit_price_cents, line_total_cents)
     VALUES (?, 1, 'Amoxicilina 250mg', 2, 1250, 2500), (?, NULL, 'Consulta general', 1, 3000, 3000)`,
  ).run(inv, inv);
  const tx = () =>
    runInTransaction(db, () => {
      recomputeTotals(db, Number(inv));
      db.prepare("UPDATE invoices SET status = 'issued', issued_at = datetime('now') WHERE id = ?").run(inv);
    });
  tx();

  console.log(`Seed complete (admin id ${admin}). Dev password: VetCura123!`);
}

main();
