// node:sqlite has no better-sqlite3-style transaction helper,
// so atomic multi-statement writes use explicit BEGIN/COMMIT here.
function runInTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors; the original error is what matters.
    }
    throw err;
  }
}

module.exports = { runInTransaction };
