// One-shot user-data merge: copies NON-SEED accounts (by email) and all
// their records from a backup DB into a freshly migrated+seeded DB.
// Usage (backend stopped): node scripts/merge-user-data.js <backup.db> [target.db]
// Refresh tokens, devices and audit trails are NOT carried over:
// every user logs in again (Google or password) after the merge.
const { DatabaseSync } = require('node:sqlite');

const [, , sourcePath, targetPath = './data/vetcura.db'] = process.argv;
if (!sourcePath) {
  console.error('Usage: node scripts/merge-user-data.js <backup.db> [target.db]');
  process.exit(1);
}

const src = new DatabaseSync(sourcePath);
const dst = new DatabaseSync(targetPath);
const moved = {};

try {
  const freshEmails = new Map(
    dst.prepare('SELECT id, email FROM users').all().map((r) => [r.email.toLowerCase(), r.id]),
  );
  const vetFallback = dst.prepare("SELECT id FROM users WHERE email = 'vet@vetcura.local'").get().id;

  // 1. Non-seed users (full row copy: password hash, google_sub, verified flag).
  const userCols = 'email, password_hash, role, google_sub, display_name, created_at, email_verified_at';
  const idMap = new Map();
  for (const u of src.prepare(`SELECT id, ${userCols} FROM users`).all()) {
    if (freshEmails.has(u.email.toLowerCase())) {
      idMap.set(u.id, freshEmails.get(u.email.toLowerCase()));
      continue;
    }
    const created = dst.prepare(`INSERT INTO users (${userCols}) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`).get(
      u.email, u.password_hash, u.role, u.google_sub, u.display_name, u.created_at, u.email_verified_at,
    );
    idMap.set(u.id, created.id);
  }
  moved.users = [...idMap.values()].filter((id) => ![...freshEmails.values()].includes(id)).length;

  const mapVet = (oldVetId) => {
    if (!oldVetId) return null;
    const srcVet = src.prepare('SELECT email FROM users WHERE id = ?').get(oldVetId);
    if (!srcVet) return null;
    const hit = dst.prepare('SELECT id FROM users WHERE email = ?').get(srcVet.email);
    return hit ? hit.id : vetFallback;
  };

  // 2. Owners + prefs for the copied accounts.
  moved.owners = 0;
  for (const [oldId, newId] of idMap) {
    const o = src.prepare('SELECT phone, address, photo_path, updated_at FROM owners WHERE user_id = ?').get(oldId);
    if (!o) continue;
    if (freshEmails.has(src.prepare('SELECT email FROM users WHERE id = ?').get(oldId).email.toLowerCase())) continue;
    dst.prepare('INSERT INTO owners (user_id, phone, address, photo_path, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      newId, o.phone, o.address, o.photo_path, o.updated_at,
    );
    const prefs = src.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(oldId);
    if (prefs) {
      dst.prepare('INSERT OR REPLACE INTO notification_prefs (user_id, push_enabled, email_enabled, appointment_reminders, vaccination_reminders, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        newId, prefs.push_enabled, prefs.email_enabled, prefs.appointment_reminders, prefs.vaccination_reminders, prefs.updated_at,
      );
    }
    moved.owners += 1;
  }

  // 3. Pets of copied owners (pet ids remapped everywhere below).
  const petMap = new Map();
  const theirOwnerIds = new Set(
    [...idMap.entries()].filter(([oldId]) => {
      const email = src.prepare('SELECT email FROM users WHERE id = ?').get(oldId).email.toLowerCase();
      return !freshEmails.has(email);
    }).map(([, newId]) => newId),
  );
  const theirOldOwnerIds = new Set(
    [...idMap.entries()].filter(([oldId]) => {
      const email = src.prepare('SELECT email FROM users WHERE id = ?').get(oldId).email.toLowerCase();
      return !freshEmails.has(email);
    }).map(([oldId]) => oldId),
  );
  for (const p of src.prepare('SELECT * FROM pets').all()) {
    if (!theirOldOwnerIds.has(p.owner_id)) continue;
    const created = dst.prepare(
      'INSERT INTO pets (owner_id, name, species, breed, birthdate, sex, weight_kg, photo_url, photo_path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).get(
      idMap.get(p.owner_id), p.name, p.species, p.breed, p.birthdate, p.sex, p.weight_kg, p.photo_url, p.photo_path, p.updated_at,
    );
    petMap.set(p.id, created.id);
  }
  moved.pets = petMap.size;

  // 4. Appointments (+ consultations, allergies) for copied pets.
  const consultMap = new Map();
  moved.appointments = 0;
  moved.consultations = 0;
  for (const a of src.prepare('SELECT * FROM appointments').all()) {
    if (!petMap.has(a.pet_id)) continue;
    const created = dst.prepare(
      'INSERT INTO appointments (pet_id, vet_user_id, starts_at, ends_at, status, reason) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    ).get(petMap.get(a.pet_id), mapVet(a.vet_user_id), a.starts_at, a.ends_at, a.status, a.reason).id;
    moved.appointments += 1;
    for (const c of src.prepare('SELECT * FROM consultations WHERE appointment_id = ?').all(a.id)) {
      const cc = dst.prepare(
        'INSERT INTO consultations (appointment_id, pet_id, vet_user_id, weight_kg, diagnosis, treatment, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      ).get(created, petMap.get(c.pet_id), mapVet(c.vet_user_id), c.weight_kg, c.diagnosis, c.treatment, c.notes, c.created_at).id;
      consultMap.set(c.id, cc);
      for (const al of src.prepare('SELECT allergy FROM consultation_allergies WHERE consultation_id = ?').all(c.id)) {
        dst.prepare('INSERT INTO consultation_allergies (consultation_id, allergy) VALUES (?, ?)').run(cc, al.allergy);
      }
      moved.consultations += 1;
    }
  }
  // Consultations without appointment.
  for (const c of src.prepare('SELECT * FROM consultations WHERE appointment_id IS NULL').all()) {
    if (!petMap.has(c.pet_id)) continue;
    const cc = dst.prepare(
      'INSERT INTO consultations (appointment_id, pet_id, vet_user_id, weight_kg, diagnosis, treatment, notes, created_at) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).get(petMap.get(c.pet_id), mapVet(c.vet_user_id), c.weight_kg, c.diagnosis, c.treatment, c.notes, c.created_at).id;
    for (const al of src.prepare('SELECT allergy FROM consultation_allergies WHERE consultation_id = ?').all(c.id)) {
      dst.prepare('INSERT INTO consultation_allergies (consultation_id, allergy) VALUES (?, ?)').run(cc, al.allergy);
    }
    moved.consultations += 1;
  }

  // 5. Vaccinations, measurements, invoices (+ items) for copied pets.
  moved.vaccinations = 0;
  for (const v of src.prepare('SELECT * FROM vaccinations').all()) {
    if (!petMap.has(v.pet_id)) continue;
    dst.prepare('INSERT INTO vaccinations (pet_id, vaccine, due_date, given_date) VALUES (?, ?, ?, ?)').run(
      petMap.get(v.pet_id), v.vaccine, v.due_date, v.given_date,
    );
    moved.vaccinations += 1;
  }
  moved.measurements = 0;
  for (const m of src.prepare('SELECT * FROM pet_weight_measurements').all()) {
    if (!petMap.has(m.pet_id)) continue;
    dst.prepare('INSERT INTO pet_weight_measurements (pet_id, weight_kg, measured_at, source, created_at) VALUES (?, ?, ?, ?, ?)').run(
      petMap.get(m.pet_id), m.weight_kg, m.measured_at, m.source, m.created_at,
    );
    moved.measurements += 1;
  }
  moved.invoices = 0;
  for (const inv of src.prepare('SELECT * FROM invoices').all()) {
    if (!petMap.has(inv.pet_id)) continue;
    // Keep the original number unless it collides with fresh seed data.
    let number = inv.number;
    if (number && dst.prepare('SELECT id FROM invoices WHERE number = ?').get(number)) {
      const maxRow = dst.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(number, 4) AS INTEGER)), 0) AS m FROM invoices WHERE number LIKE 'FV-%'").get();
      number = `FV-${String(maxRow.m + 1).padStart(4, '0')}`;
    }
    const created = dst.prepare(
      'INSERT INTO invoices (pet_id, owner_id, vet_user_id, status, subtotal_cents, tax_cents, total_cents, issued_at, number, payment_method, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).get(
      petMap.get(inv.pet_id), idMap.get(inv.owner_id), mapVet(inv.vet_user_id), inv.status,
      inv.subtotal_cents, inv.tax_cents, inv.total_cents, inv.issued_at, number,
      inv.payment_method, inv.paid_at,
    ).id;
    for (const it of src.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id)) {
      dst.prepare('INSERT INTO invoice_items (invoice_id, medication_id, description, qty, unit_price_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?)').run(
        created, it.medication_id, it.description, it.qty, it.unit_price_cents, it.line_total_cents,
      );
    }
    moved.invoices += 1;
  }

  console.log(`Merge complete: ${JSON.stringify(moved)}`);
  console.log('Note: sessions/devices/audit were NOT carried over — every user logs in again.');
} finally {
  src.close();
  dst.close();
}
