// Notification engine: idempotent queue, pluggable providers, reconciler.
// Payloads carry minimal non-clinical text; details are fetched in-app
// after authentication. Unconfigured providers never fake success:
// items stay pending/failed with a recorded error.
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const { ensurePrefs } = require('../routes/profile');

const MAX_ATTEMPTS = 5;
const KIND_CATEGORY = {
  appointment: 'appointment_reminders',
  vaccination: 'vaccination_reminders',
  clinic: null, // operational availability notice: channel-gated only
};

function todayISO(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);
}

function enqueue(db, { key, userId, kind, title, body }) {
  const prefs = ensurePrefs(db, userId);
  const category = KIND_CATEGORY[kind];
  if (category && !prefs[category]) return null; // category disabled: do not queue
  const row = db
    .prepare(
      `INSERT INTO notification_queue
         (idempotency_key, user_id, kind, title, body, scheduled_for)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(idempotency_key) DO NOTHING
       RETURNING id`,
    )
    .get(key, userId, kind, title, body);
  return row ? Number(row.id) : null;
}

function cancelPending(db, likePattern) {
  db.prepare("UPDATE notification_queue SET status = 'cancelled' WHERE idempotency_key LIKE ? AND status = 'pending'")
    .run(likePattern);
}

// Reconciles scheduled reminders with current system data (idempotent).
// Called by the periodic sender; booking endpoints stay untouched.
function reconcile(db) {
  const now = new Date().toISOString();
  // Appointment reminders 24h before, for scheduled/checked_in in range.
  const upcoming = db
    .prepare(
      `SELECT a.id, a.starts_at, p.owner_id FROM appointments a
       JOIN pets p ON p.id = a.pet_id
       WHERE a.status IN ('scheduled','checked_in') AND datetime(a.starts_at) > datetime('now')`,
    )
    .all();
  for (const a of upcoming) {
    const fireAt = new Date(new Date(a.starts_at).getTime() - 24 * 3600e3);
    const scheduledFor = (fireAt < new Date() ? new Date() : fireAt).toISOString();
    const id = enqueue(db, {
      key: `appt:${a.id}:${a.starts_at}`,
      userId: a.owner_id,
      kind: 'appointment',
      title: 'VetCura: recordatorio de cita',
      body: 'Tienes una cita programada. Abre la app para ver los detalles.',
    });
    if (id) {
      db.prepare('UPDATE notification_queue SET scheduled_for = ? WHERE id = ?').run(scheduledFor, id);
    }
  }
  // Dead appointments: cancel their pending reminders.
  const dead = db.prepare("SELECT id FROM appointments WHERE status IN ('cancelled','no_show') OR datetime(starts_at) <= datetime('now')").all();
  for (const a of dead) cancelPending(db, `appt:${a.id}:%`);

  // Vaccination reminders: ungiven, due within 7 days.
  const vaccs = db
    .prepare(
      `SELECT v.id, v.due_date, p.owner_id FROM vaccinations v
       JOIN pets p ON p.id = v.pet_id
       WHERE v.given_date IS NULL AND date(v.due_date) <= date('now', '+7 days')`,
    )
    .all();
  for (const v of vaccs) {
    enqueue(db, {
      key: `vacc:${v.id}:${v.due_date}`,
      userId: v.owner_id,
      kind: 'vaccination',
      title: 'VetCura: vacuna próxima o vencida',
      body: 'Una vacuna de tu mascota vence pronto o está vencida. Abre la app para ver los detalles.',
    });
  }
  // Given or long-past vaccinations: cancel pending.
  const doneVaccs = db
    .prepare("SELECT id FROM vaccinations WHERE given_date IS NOT NULL OR date(due_date) < date('now', '-30 days')")
    .all();
  for (const v of doneVaccs) cancelPending(db, `vacc:${v.id}:%`);
  void now;
}

// ---- Providers (desacoplados) ----
// Email via SMTP when SMTP_HOST* is set; otherwise honestly unavailable.
function buildEmailProvider() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      name: 'disabled-email',
      async send() {
        const e = new Error('Email provider not configured');
        e.code = 'provider_unconfigured';
        throw e;
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return {
    name: 'smtp',
    async send({ to, subject, text }) {
      await transport.sendMail({ from: SMTP_FROM || SMTP_USER, to, subject, text });
    },
  };
}

// FCM HTTP v1 with a service account (no firebase-admin dependency).
// Without FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_* it honestly refuses.
let fcmAccessToken = null;
async function fcmBearer() {
  const { FCM_SERVICE_ACCOUNT_EMAIL, FCM_SERVICE_ACCOUNT_KEY } = process.env;
  const client = new OAuth2Client();
  const key = (FCM_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');
  client.setCredentials({ client_email: FCM_SERVICE_ACCOUNT_EMAIL, private_key: key });
  const { token } = await client.getAccessToken();
  return token;
}

function buildPushProvider() {
  const { FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_EMAIL, FCM_SERVICE_ACCOUNT_KEY } = process.env;
  if (!FCM_PROJECT_ID || !FCM_SERVICE_ACCOUNT_EMAIL || !FCM_SERVICE_ACCOUNT_KEY) {
    return {
      name: 'disabled-push',
      async send() {
        const e = new Error('Push provider not configured');
        e.code = 'provider_unconfigured';
        throw e;
      },
    };
  }
  return {
    name: 'fcm',
    async send({ token, title, body }) {
      const bearer = fcmAccessToken || (fcmAccessToken = await fcmBearer());
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token, notification: { title, body } } }),
        },
      );
      if (res.status === 404 || res.status === 400) {
        const e = new Error('FCM token invalid');
        e.code = 'fcm_invalid_token';
        throw e;
      }
      if (!res.ok) {
        const e = new Error(`FCM error ${res.status}`);
        e.code = 'fcm_error';
        throw e;
      }
    },
  };
}

function verifiedEmail(db, userId) {
  const row = db.prepare('SELECT email, email_verified_at FROM users WHERE id = ?').get(userId);
  if (!row || !row.email || row.email.endsWith('@placeholder.local') || row.email.endsWith('@noemail.local')) {
    return null;
  }
  return row.email;
}

// Processes due items once. Returns counts. Pure against injected providers.
async function processDue(db, { email, push }) {
  const due = db
    .prepare("SELECT * FROM notification_queue WHERE status = 'pending' AND datetime(scheduled_for) <= datetime('now') ORDER BY scheduled_for LIMIT 50")
    .all();
  const counts = { sent: 0, failed: 0, cancelled: 0, pending: 0 };
  for (const item of due) {
    try {
      const prefs = ensurePrefs(db, item.user_id);
      const category = KIND_CATEGORY[item.kind];
      if ((category && !prefs[category]) || (!prefs.push_enabled && !prefs.email_enabled)) {
        db.prepare("UPDATE notification_queue SET status = 'cancelled' WHERE id = ?").run(item.id);
        counts.cancelled += 1;
        continue;
      }
      let delivered = false;
      const errors = [];
      if (prefs.push_enabled) {
        const devices = db.prepare('SELECT fcm_token FROM devices WHERE user_id = ?').all(item.user_id);
        for (const d of devices) {
          try {
            await push.send({ token: d.fcm_token, title: item.title, body: item.body });
            delivered = true;
          } catch (e) {
            if (e && e.code === 'fcm_invalid_token') {
              db.prepare('DELETE FROM devices WHERE fcm_token = ?').run(d.fcm_token);
            } else {
              errors.push(e.message);
            }
          }
        }
      }
      if (prefs.email_enabled) {
        const to = verifiedEmail(db, item.user_id);
        if (to) {
          try {
            await email.send({ to, subject: item.title, text: `${item.body}\n\n— Equipo VetCura` });
            delivered = true;
          } catch (e) {
            errors.push(e.message);
          }
        } else {
          errors.push('no verified recipient');
        }
      }
      if (delivered) {
        db.prepare("UPDATE notification_queue SET status = 'sent', sent_at = datetime('now'), attempts = attempts + 1 WHERE id = ?").run(item.id);
        counts.sent += 1;
      } else {
        throw new Error(errors.join('; ') || 'no channel delivered');
      }
    } catch (e) {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        db.prepare("UPDATE notification_queue SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?")
          .run(attempts, String(e.message || e).slice(0, 500), item.id);
        counts.failed += 1;
      } else {
        const backoffH = attempts * attempts;
        db.prepare("UPDATE notification_queue SET attempts = ?, last_error = ?, scheduled_for = datetime('now', ?) WHERE id = ?")
          .run(attempts, String(e.message || e).slice(0, 500), `+${backoffH} hours`, item.id);
        counts.pending += 1;
      }
    }
  }
  return counts;
}

module.exports = {
  enqueue, cancelPending, reconcile, processDue,
  buildEmailProvider, buildPushProvider, verifiedEmail,
  KIND_CATEGORY, MAX_ATTEMPTS, todayISO,
};
