// Audit log writer. Callers must NEVER pass secrets (passwords, tokens,
// hashes, clinical detail beyond identifiers) in meta.
function audit(db, { actor = null, action, targetType = null, targetId = null, meta = null }) {
  db.prepare(
    'INSERT INTO audit_log (actor_user_id, action, target_type, target_id, meta) VALUES (?, ?, ?, ?, ?)',
  ).run(
    actor, action, targetType, targetId,
    meta ? JSON.stringify(meta) : null,
  );
}

module.exports = { audit };
