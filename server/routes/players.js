const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../audit');
const { handleDbError, paginationParams } = require('../util');

const router = express.Router();
const MANAGE_ROLES = ['admin', 'tournament_manager', 'data_entry'];

router.use(requireAuth);

router.get('/', (req, res) => {
  const { team_id, category, q } = req.query;
  const clauses = [];
  const params = [];
  if (team_id) { clauses.push('p.team_id = ?'); params.push(team_id); }
  if (category) { clauses.push('p.category = ?'); params.push(category); }
  if (q) { clauses.push('(p.name LIKE ? OR t.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { page, limit, offset } = paginationParams(req.query, 25, 100);
  const total = db.prepare(`SELECT COUNT(*) c FROM players p JOIN teams t ON t.id = p.team_id ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT p.*, t.name as team_name, t.code as team_code
    FROM players p JOIN teams t ON t.id = p.team_id
    ${where}
    ORDER BY p.name
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  res.json({ items: rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/:id', (req, res) => {
  const player = db.prepare(`
    SELECT p.*, t.name as team_name, t.code as team_code FROM players p JOIN teams t ON t.id = p.team_id WHERE p.id = ?
  `).get(req.params.id);
  if (!player) return res.status(404).json({ error: 'اللاعب غير موجود' });
  res.json({ item: player });
});

router.post('/', requireRole(...MANAGE_ROLES), (req, res) => {
  const { name, number, position, team_id, category } = req.body || {};
  if (!name || !number || !position || !team_id || !category) {
    return res.status(400).json({ error: 'جميع بيانات اللاعب مطلوبة' });
  }
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(team_id);
  if (!team) return res.status(400).json({ error: 'المنتخب المحدد غير موجود' });
  const dup = db.prepare('SELECT id FROM players WHERE team_id = ? AND category = ? AND number = ?').get(team_id, category, number);
  if (dup) return res.status(409).json({ error: 'رقم اللاعب مستخدم بالفعل في هذا المنتخب لنفس الفئة', code: 'DUPLICATE' });
  try {
    const info = db.prepare(`
      INSERT INTO players (name, number, position, team_id, category) VALUES (?, ?, ?, ?, ?)
    `).run(name, number, position, team_id, category);
    const created = db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
    recordAudit(req, { action: 'create', entity: 'player', entityId: created.id, after: created });
    res.status(201).json({ item: created });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.put('/:id', requireRole(...MANAGE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'اللاعب غير موجود' });
  const { name, number, position, team_id, category } = req.body || {};
  const merged = {
    name: name ?? existing.name,
    number: number ?? existing.number,
    position: position ?? existing.position,
    team_id: team_id ?? existing.team_id,
    category: category ?? existing.category,
  };
  const dup = db.prepare('SELECT id FROM players WHERE team_id = ? AND category = ? AND number = ? AND id != ?')
    .get(merged.team_id, merged.category, merged.number, req.params.id);
  if (dup) return res.status(409).json({ error: 'رقم اللاعب مستخدم بالفعل في هذا المنتخب لنفس الفئة', code: 'DUPLICATE' });
  try {
    db.prepare(`
      UPDATE players SET name=?, number=?, position=?, team_id=?, category=?, updated_at=datetime('now') WHERE id=?
    `).run(merged.name, merged.number, merged.position, merged.team_id, merged.category, req.params.id);
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
    recordAudit(req, { action: 'update', entity: 'player', entityId: updated.id, before: existing, after: updated });
    res.json({ item: updated });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:id', requireRole(...MANAGE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'اللاعب غير موجود' });
  const refs = db.prepare('SELECT COUNT(*) c FROM match_events WHERE player_id = ?').get(req.params.id).c
    + db.prepare('SELECT COUNT(*) c FROM match_lineups WHERE player_id = ?').get(req.params.id).c;
  if (refs > 0) {
    return res.status(409).json({ error: 'لا يمكن حذف اللاعب لوجود إحصائيات مباريات مرتبطة به', code: 'REFERENCED' });
  }
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  recordAudit(req, { action: 'delete', entity: 'player', entityId: existing.id, before: existing });
  res.json({ ok: true });
});

module.exports = router;
