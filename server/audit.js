const db = require('./db');

const insertAudit = db.prepare(`
  INSERT INTO audit_log (user_id, username, action, entity, entity_id, before_json, after_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function recordAudit(req, { action, entity, entityId = null, before = null, after = null }) {
  const user = req.session && req.session.user;
  insertAudit.run(
    user ? user.id : null,
    user ? user.username : 'system',
    action,
    entity,
    entityId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null
  );
}

module.exports = { recordAudit };
