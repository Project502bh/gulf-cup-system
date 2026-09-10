const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../audit');
const { handleDbError } = require('../util');

const router = express.Router();
const MANAGE_ROLES = ['admin', 'tournament_manager', 'data_entry'];

router.use(requireAuth);

router.get('/', (req, res) => {
  const { category, q } = req.query;
  const clauses = [];
  const params = [];
  if (category) { clauses.push('category = ?'); params.push(category); }
  if (q) { clauses.push('(name LIKE ? OR country LIKE ? OR code LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM teams ${where} ORDER BY name`).all(...params);
  res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'المنتخب غير موجود' });
  const players = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY number').all(team.id);
  res.json({ item: team, players });
});

router.post('/', requireRole(...MANAGE_ROLES), (req, res) => {
  const { name, country, code, coach, category, flag } = req.body || {};
  if (!name || !country || !code || !category) {
    return res.status(400).json({ error: 'اسم المنتخب والدولة والرمز والفئة مطلوبة' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO teams (name, country, code, coach, category, flag) VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, country, code.toUpperCase(), coach || null, category, flag || null);
    const created = db.prepare('SELECT * FROM teams WHERE id = ?').get(info.lastInsertRowid);
    recordAudit(req, { action: 'create', entity: 'team', entityId: created.id, after: created });
    res.status(201).json({ item: created });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.put('/:id', requireRole(...MANAGE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المنتخب غير موجود' });
  const { name, country, code, coach, category, flag } = req.body || {};
  const merged = {
    name: name ?? existing.name,
    country: country ?? existing.country,
    code: (code ?? existing.code).toUpperCase(),
    coach: coach ?? existing.coach,
    category: category ?? existing.category,
    flag: flag ?? existing.flag,
  };
  try {
    db.prepare(`
      UPDATE teams SET name=?, country=?, code=?, coach=?, category=?, flag=?, updated_at=datetime('now') WHERE id=?
    `).run(merged.name, merged.country, merged.code, merged.coach, merged.category, merged.flag, req.params.id);
    const updated = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    recordAudit(req, { action: 'update', entity: 'team', entityId: updated.id, before: existing, after: updated });
    res.json({ item: updated });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:id', requireRole(...MANAGE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المنتخب غير موجود' });
  const refs = db.prepare('SELECT COUNT(*) c FROM group_teams WHERE team_id = ?').get(req.params.id).c
    + db.prepare('SELECT COUNT(*) c FROM matches WHERE home_team_id = ? OR away_team_id = ?').get(req.params.id, req.params.id).c;
  const playerCount = db.prepare('SELECT COUNT(*) c FROM players WHERE team_id = ?').get(req.params.id).c;
  if (refs > 0 || playerCount > 0) {
    return res.status(409).json({ error: 'لا يمكن حذف المنتخب لوجود لاعبين أو مباريات مرتبطة به', code: 'REFERENCED' });
  }
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  recordAudit(req, { action: 'delete', entity: 'team', entityId: existing.id, before: existing });
  res.json({ ok: true });
});

module.exports = router;
