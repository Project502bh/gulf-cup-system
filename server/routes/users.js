const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole, ROLE_LABELS } = require('../middleware/auth');
const { recordAudit } = require('../audit');
const { handleDbError } = require('../util');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, username, full_name, role, created_at FROM users ORDER BY id').all();
  res.json({ items: rows, roleLabels: ROLE_LABELS });
});

router.post('/', (req, res) => {
  const { username, password, full_name, role } = req.body || {};
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'جميع بيانات المستخدم مطلوبة' });
  }
  if (!ROLE_LABELS[role]) return res.status(400).json({ error: 'دور غير صالح' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)').run(username, hash, full_name, role);
    const created = db.prepare('SELECT id, username, full_name, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
    recordAudit(req, { action: 'create', entity: 'user', entityId: created.id, after: created });
    res.status(201).json({ item: created });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { full_name, role, password } = req.body || {};
  if (role && !ROLE_LABELS[role]) return res.status(400).json({ error: 'دور غير صالح' });
  const merged = { full_name: full_name ?? existing.full_name, role: role ?? existing.role };
  try {
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET full_name=?, role=?, password_hash=? WHERE id=?').run(merged.full_name, merged.role, hash, req.params.id);
    } else {
      db.prepare('UPDATE users SET full_name=?, role=? WHERE id=?').run(merged.full_name, merged.role, req.params.id);
    }
    const updated = db.prepare('SELECT id, username, full_name, role, created_at FROM users WHERE id = ?').get(req.params.id);
    recordAudit(req, { action: 'update', entity: 'user', entityId: updated.id, before: { ...existing, password_hash: undefined }, after: updated });
    res.json({ item: updated });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (req.session.user.id === existing.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  recordAudit(req, { action: 'delete', entity: 'user', entityId: existing.id, before: { ...existing, password_hash: undefined } });
  res.json({ ok: true });
});

module.exports = router;
