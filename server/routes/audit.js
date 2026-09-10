const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { paginationParams } = require('../util');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const { q, entity } = req.query;
  const clauses = [];
  const params = [];
  if (entity) { clauses.push('entity = ?'); params.push(entity); }
  if (q) { clauses.push('(username LIKE ? OR action LIKE ? OR entity LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { page, limit, offset } = paginationParams(req.query, 30, 100);
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_log ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ items: rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

module.exports = router;
