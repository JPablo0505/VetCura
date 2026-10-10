// Periodic notification sender. Run every 15-60 min via cron/systemd:
//   */30 * * * * cd /srv/vetcura/backend && DATABASE_PATH=./data/vetcura.db node scripts/send-due.js
// Reconciles reminders with current data, then delivers due items.
// Exit 0 with a JSON summary; providers report their own honest errors.
require('dotenv').config();
const { openDatabase } = require('../db');
const { reconcile, processDue, buildEmailProvider, buildPushProvider } = require('../src/lib/notify');

async function main() {
  const db = openDatabase(process.env.DATABASE_PATH || './data/vetcura.db');
  try {
    reconcile(db);
    const counts = await processDue(db, { email: buildEmailProvider(), push: buildPushProvider() });
    console.log(JSON.stringify({ ok: true, counts }));
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exitCode = 1;
});
