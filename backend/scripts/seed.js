// Controlled seed data for local development and demos.
// Credentials are development-only placeholders, never production secrets.
require('dotenv').config();
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
  db.prepare("UPDATE users SET professional_id = 'MP-10234' WHERE id = ?").run(vet);
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
  db.prepare('INSERT INTO owners (user_id, phone) VALUES (?, ?)').run(demo, '+57 300 000 0001');
  const firulais = db
    .prepare(
      "INSERT INTO pets (owner_id, name, species, breed, birthdate, sex, weight_kg) VALUES (?, 'Firulais', 'dog', 'Mestizo', '2022-09-01', 'male', 15.0) RETURNING id",
    )
    .get(demo).id;
  db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date) VALUES (?, ?, ?)').run(
    firulais, 'Rabia', new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
  );
  db.prepare('INSERT INTO owners (user_id, phone) VALUES (?, ?)').run(owner1, '+57 300 111 2222');
  db.prepare('INSERT INTO owners (user_id, phone) VALUES (?, ?)').run(owner2, '+57 300 333 4444');

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

  // Dr. Rivera works Mon–Fri 08:00–17:00 (weekday 1–5, minutes since midnight).
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    db.prepare('INSERT INTO vet_availability (vet_user_id, weekday, start_min, end_min) VALUES (?, ?, 480, 1020)').run(vet, weekday);
  }

  // Four more vets with varied schedules (names from the mockups).
  const vetTorres = user('valentina.torres@vetcura.local', 'vet', 'Dra. Valentina Torres');
  const vetArancibia = user('camilo.arancibia@vetcura.local', 'vet', 'Dr. Camilo Arancibia');
  const vetRuiz = user('francisca.ruiz@vetcura.local', 'vet', 'Dra. Francisca Ruiz');
  const vetMorales = user('ignacio.morales@vetcura.local', 'vet', 'Dr. Ignacio Morales');
  db.prepare("UPDATE users SET professional_id = 'MP-20451' WHERE id = ?").run(vetTorres);
  db.prepare("UPDATE users SET professional_id = 'MP-31770' WHERE id = ?").run(vetArancibia);
  db.prepare("UPDATE users SET professional_id = 'MP-42883' WHERE id = ?").run(vetRuiz);
  db.prepare("UPDATE users SET professional_id = 'MP-53996' WHERE id = ?").run(vetMorales);
  const schedule = (id, days, start, end) => {
    for (const day of days) {
      db.prepare('INSERT INTO vet_availability (vet_user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)').run(id, day, start, end);
    }
  };
  schedule(vetTorres, [1, 2, 3, 4, 5, 6], 480, 1020); // Mon–Sat 08–17
  schedule(vetArancibia, [1, 2, 3, 4], 540, 1080); // Mon–Thu 09–18
  schedule(vetRuiz, [2, 3, 4, 5, 6], 600, 1140); // Tue–Sat 10–19
  schedule(vetMorales, [1, 2, 3, 4, 5], 480, 840); // Mon–Fri 08–14

  // Five more clients (1–3 pets each) with varied clinical activity.
  // Dates below are computed on weekdays so seeded appointments respect
  // the vets' working hours.
  const atDay = (daysAhead, hourCOT) => {
    const d = new Date(Date.now() + daysAhead * 864e5);
    const cot = new Date(d.getTime() - 5 * 3600e3);
    const dow = cot.getUTCDay();
    const shift = dow === 0 ? 1 : dow === 6 ? 2 : 0; // push weekend to Monday
    const target = new Date(d.getTime() + shift * 864e5);
    const t = new Date(target.getTime() - 5 * 3600e3);
    t.setUTCHours(hourCOT + 5, 0, 0, 0);
    return t.toISOString();
  };
  const mkOwner = (email, name, phone) => {
    const id = user(email, 'owner', name);
    db.prepare('INSERT INTO owners (user_id, phone) VALUES (?, ?)').run(id, phone);
    return id;
  };
  const mkPet = (ownerId, name, species, breed, birthdate, sex, weight) => db
    .prepare('INSERT INTO pets (owner_id, name, species, breed, birthdate, sex, weight_kg) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .get(ownerId, name, species, breed, birthdate, sex, weight).id;
  const mkAppt = (petId, vetId, startsAt, status, reason) => db
    .prepare("INSERT INTO appointments (pet_id, vet_user_id, starts_at, ends_at, status, reason) VALUES (?, ?, ?, datetime(?, '+30 minutes'), ?, ?)")
    .run(petId, vetId, startsAt, startsAt, status, reason).lastInsertRowid;

  const camila = mkOwner('camila@example.com', 'Camila Sepulveda', '+57 310 111 2233');
  const max = mkPet(camila, 'Max', 'dog', 'Golden Retriever', '2021-06-15', 'male', 30.1);
  const lunaC = mkPet(camila, 'Luna', 'cat', 'Siames', '2022-11-02', 'female', 3.8);
  const carlos = mkOwner('carlos@example.com', 'Carlos Mena', '+57 311 222 3344');
  const simba = mkPet(carlos, 'Simba', 'cat', 'Domestico', '2020-02-20', 'male', 5.1);
  const andrea = mkOwner('andrea@example.com', 'Andrea Soto', '+57 312 333 4455');
  const bella = mkPet(andrea, 'Bella', 'dog', 'Pastor Aleman', '2018-08-10', 'female', 32.0);
  const mishi = mkPet(andrea, 'Mishi', 'cat', 'Siames', '2023-05-01', 'female', 3.5);
  const maria = mkOwner('maria@example.com', 'Maria Paz', '+57 313 444 5566');
  const thor = mkPet(maria, 'Thor', 'dog', 'Bulldog Frances', '2021-01-25', 'male', 14.3);
  const kira = mkPet(maria, 'Kira', 'dog', 'Doberman', '2022-04-17', 'female', 29.0);
  const felipe = mkOwner('felipe@example.com', 'Felipe Morales', '+57 314 555 6677');
  const milo = mkPet(felipe, 'Milo', 'dog', 'Beagle', '2021-09-30', 'male', 11.2);
  const oliver = mkPet(felipe, 'Oliver', 'cat', 'Comun', '2022-12-12', 'male', 4.8);

  const pastDone = (petId, vetId, daysAgo, reason, diagnosis) => {
    const startsAt = atDay(-daysAgo, 10);
    const appt = mkAppt(petId, vetId, startsAt, 'done', reason);
    db.prepare('INSERT INTO consultations (appointment_id, pet_id, vet_user_id, diagnosis) VALUES (?, ?, ?, ?)').run(appt, petId, vetId, diagnosis);
    return appt;
  };
  pastDone(max, vetTorres, 6, 'Control anual', 'Paciente sano, plan de vacunacion al dia');
  pastDone(bella, vetRuiz, 4, 'Dermatitis', 'Dermatitis alergica leve');
  pastDone(simba, vetMorales, 9, 'Revision', 'Urolitiasis en seguimiento');
  mkAppt(max, vetTorres, atDay(2, 10), 'scheduled', 'Chequeo general');
  mkAppt(mishi, vetTorres, atDay(3, 15), 'scheduled', 'Vacuna triple felina');
  mkAppt(thor, vetArancibia, atDay(4, 9), 'scheduled', 'Control post-operatorio');
  mkAppt(milo, vetMorales, atDay(5, 11), 'cancelled', 'Esterilizacion programada');
  db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date) VALUES (?, ?, ?)').run(
    max, 'Antirrabica', new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
  );
  db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date) VALUES (?, ?, ?)').run(
    simba, 'Triple felina', new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10),
  );
  db.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date, given_date) VALUES (?, ?, ?, ?)').run(
    bella, 'Polivalente', '2024-03-01', '2024-03-01',
  );

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
    .prepare("INSERT INTO invoices (pet_id, owner_id, vet_user_id, status) VALUES (?, ?, ?, 'draft')")
    .run(rocky, owner1, vet).lastInsertRowid;
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, medication_id, description, qty, unit_price_cents, line_total_cents)
     VALUES (?, 1, 'Amoxicilina 250mg', 2, 1250, 2500), (?, NULL, 'Consulta general', 1, 3000, 3000)`,
  ).run(inv, inv);
  const tx = () =>
    runInTransaction(db, () => {
      recomputeTotals(db, Number(inv));
      db.prepare("UPDATE invoices SET status = 'issued', issued_at = datetime('now'), number = 'FV-0001' WHERE id = ?").run(inv);
    });
  tx();

  // Issued invoice for Maria Paz (Thor), payable from the owner app.
  const inv2 = db
    .prepare("INSERT INTO invoices (pet_id, owner_id, vet_user_id, status) VALUES (?, ?, ?, 'draft')")
    .run(thor, maria, vetTorres).lastInsertRowid;
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, medication_id, description, qty, unit_price_cents, line_total_cents)
     VALUES (?, 2, 'Vacuna polivalente', 1, 2800, 2800), (?, NULL, 'Control post-operatorio', 1, 4500, 4500)`,
  ).run(inv2, inv2);
  const tx2 = () =>
    runInTransaction(db, () => {
      recomputeTotals(db, Number(inv2));
      db.prepare("UPDATE invoices SET status = 'issued', issued_at = datetime('now'), number = 'FV-0002' WHERE id = ?").run(inv2);
    });
  tx2();

  console.log(`Seed complete (admin id ${admin}). Dev password: VetCura123!`);
}

main();
