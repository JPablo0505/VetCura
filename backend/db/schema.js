// SQLite schema + migrations. Applied in order; each migration is
// idempotent-guarded via the schema_migrations table.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')))
;
`;

const MIGRATIONS = [
  `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','vet','staff','owner')),
    google_sub TEXT UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))
  ;
  CREATE TABLE owners (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    phone TEXT,
    address TEXT)
  ;
  CREATE TABLE pets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES owners(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT,
    birthdate TEXT,
    sex TEXT CHECK (sex IN ('male','female','unknown')),
    weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg > 0),
    photo_url TEXT)
  ;
  CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    vet_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled'
      CHECK (status IN ('scheduled','checked_in','done','cancelled','no_show')),
    reason TEXT,
    CHECK (datetime(ends_at) > datetime(starts_at)))
  ;
  CREATE INDEX idx_appointments_vet_time
    ON appointments(vet_user_id, starts_at, ends_at)
  ;
  CREATE TABLE consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    vet_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg > 0),
    diagnosis TEXT NOT NULL,
    treatment TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))
  ;
  CREATE TABLE consultation_allergies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    allergy TEXT NOT NULL)
  ;
  CREATE TABLE vaccinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    vaccine TEXT NOT NULL,
    due_date TEXT NOT NULL,
    given_date TEXT)
  ;
  CREATE INDEX idx_vaccinations_pet_due ON vaccinations(pet_id, due_date);
  CREATE TABLE medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('drug','supply')),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0))
  ;
  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    owner_id INTEGER NOT NULL REFERENCES owners(user_id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft','issued','paid','void')),
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    issued_at TEXT)
  ;
  CREATE TABLE invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    medication_id INTEGER REFERENCES medications(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL)
  ;`,
  `CREATE TABLE refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))
  ;
  CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id)
  ;
  CREATE TABLE notification_prefs (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    push_enabled INTEGER NOT NULL DEFAULT 1,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    appointment_reminders INTEGER NOT NULL DEFAULT 1,
    vaccination_reminders INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')))
  ;
  CREATE TABLE devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'android',
    fcm_token TEXT NOT NULL UNIQUE,
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')))
  ;
  CREATE INDEX idx_devices_user ON devices(user_id)
  ;
  CREATE TABLE notification_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','sent','failed','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    scheduled_for TEXT NOT NULL,
    sent_at TEXT,
    last_error TEXT)
  ;
  CREATE INDEX idx_notification_queue_due ON notification_queue(status, scheduled_for)
  ;
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))
  ;
  CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id)
  ;
  CREATE TABLE pet_weight_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    weight_kg REAL NOT NULL CHECK (weight_kg > 0),
    measured_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now')))
  ;
  CREATE INDEX idx_weight_pet ON pet_weight_measurements(pet_id, measured_at)
  ;
  ALTER TABLE owners ADD COLUMN photo_path TEXT
  ;
  ALTER TABLE owners ADD COLUMN updated_at TEXT
  ;
  ALTER TABLE pets ADD COLUMN photo_path TEXT
  ;
  ALTER TABLE pets ADD COLUMN updated_at TEXT
  ;
  ALTER TABLE users ADD COLUMN email_verified_at TEXT
  ;`,
  `CREATE TABLE vet_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vet_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
    start_min INTEGER NOT NULL CHECK (start_min >= 0 AND start_min < 1440),
    end_min INTEGER NOT NULL CHECK (end_min > 0 AND end_min <= 1440),
    CHECK (end_min > start_min),
    UNIQUE (vet_user_id, weekday, start_min))
  ;
  CREATE INDEX idx_availability_vet_day ON vet_availability(vet_user_id, weekday)
  ;`,
  `ALTER TABLE invoices ADD COLUMN number TEXT
  ;
  ALTER TABLE invoices ADD COLUMN payment_method TEXT
  ;
  ALTER TABLE invoices ADD COLUMN paid_at TEXT
  ;
  CREATE UNIQUE INDEX idx_invoices_number ON invoices(number)
  ;`,
  `ALTER TABLE invoices ADD COLUMN vet_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  ;`,
];

// NOTE: keep this SQL free of ';' inside string literals or comments:
// execScript splits naively on ';'. SQLite also forbids non-deterministic
// functions such as date('now') inside CHECK constraints, so future-date
// validation for vaccinations.given_date lives in the API layer (zod).
function execScript(db, sql) {
  // node:sqlite executes one statement per exec() call.
  for (const stmt of sql.split(';')) {
    if (stmt.trim().length > 0) {
      try {
        db.exec(stmt);
      } catch (e) {
        e.failedStatement = stmt.trim().slice(0, 300);
        throw e;
      }
    }
  }
}

function migrate(db) {
  execScript(db, SCHEMA);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version),
  );
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (!applied.has(version)) {
      // Atomic per migration: a failed migration leaves no partial tables.
      db.exec('BEGIN IMMEDIATE');
      try {
        execScript(db, sql);
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
        db.exec('COMMIT');
      } catch (e) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Ignore rollback errors; the original error is what matters.
        }
        throw e;
      }
    }
  });
}

module.exports = { migrate };
