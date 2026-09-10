const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../audit');
const { handleDbError } = require('../util');

const router = express.Router();

const WRITE_ROLES = ['admin', 'tournament_manager', 'data_entry'];
const DELETE_ROLES = ['admin', 'tournament_manager'];

router.use(requireAuth);

router.get('/', (req, res) => {
  const { category, status, q } = req.query;
  const clauses = [];
  const params = [];
  if (category) { clauses.push('category = ?'); params.push(category); }
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (q) { clauses.push('name LIKE ?'); params.push(`%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM tournaments ${where} ORDER BY start_date DESC`).all(...params);
  res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'البطولة غير موجودة' });
  const groups = db.prepare('SELECT * FROM groups_ WHERE tournament_id = ? ORDER BY sort_order').all(t.id);
  const groupTeams = db.prepare(`
    SELECT gt.*, tm.name as team_name, tm.code as team_code, tm.flag as team_flag
    FROM group_teams gt JOIN teams tm ON tm.id = gt.team_id
    WHERE gt.group_id IN (SELECT id FROM groups_ WHERE tournament_id = ?)
    ORDER BY gt.seed_order
  `).all(t.id);
  for (const g of groups) {
    g.teams = groupTeams.filter(gt => gt.group_id === g.id);
  }
  res.json({ item: t, groups });
});

router.post('/', requireRole(...WRITE_ROLES), (req, res) => {
  const { name, category, year, host_country, host_city, start_date, end_date, status } = req.body || {};
  if (!name || !category || !year || !host_country || !start_date || !end_date) {
    return res.status(400).json({ error: 'جميع الحقول الأساسية مطلوبة' });
  }
  if (new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ error: 'لا يجوز أن يكون تاريخ النهاية أسبق من تاريخ البداية' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO tournaments (name, category, year, host_country, host_city, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, category, year, host_country, host_city || null, start_date, end_date, status || 'upcoming');
    const created = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(info.lastInsertRowid);
    recordAudit(req, { action: 'create', entity: 'tournament', entityId: created.id, after: created });
    res.status(201).json({ item: created });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.put('/:id', requireRole(...WRITE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'البطولة غير موجودة' });
  const { name, category, year, host_country, host_city, start_date, end_date, status } = req.body || {};
  const merged = {
    name: name ?? existing.name,
    category: category ?? existing.category,
    year: year ?? existing.year,
    host_country: host_country ?? existing.host_country,
    host_city: host_city ?? existing.host_city,
    start_date: start_date ?? existing.start_date,
    end_date: end_date ?? existing.end_date,
    status: status ?? existing.status,
  };
  if (new Date(merged.end_date) < new Date(merged.start_date)) {
    return res.status(400).json({ error: 'لا يجوز أن يكون تاريخ النهاية أسبق من تاريخ البداية' });
  }
  try {
    db.prepare(`
      UPDATE tournaments SET name=?, category=?, year=?, host_country=?, host_city=?, start_date=?, end_date=?, status=?, updated_at=datetime('now')
      WHERE id=?
    `).run(merged.name, merged.category, merged.year, merged.host_country, merged.host_city, merged.start_date, merged.end_date, merged.status, req.params.id);
    const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
    recordAudit(req, { action: 'update', entity: 'tournament', entityId: updated.id, before: existing, after: updated });
    res.json({ item: updated });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:id', requireRole(...DELETE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'البطولة غير موجودة' });
  const matchCount = db.prepare('SELECT COUNT(*) c FROM matches WHERE tournament_id = ?').get(req.params.id).c;
  if (matchCount > 0) {
    return res.status(409).json({ error: 'لا يمكن حذف البطولة لوجود مباريات مرتبطة بها. يمكن أرشفتها بدلاً من ذلك.', code: 'REFERENCED' });
  }
  try {
    db.prepare('DELETE FROM groups_ WHERE tournament_id = ?').run(req.params.id);
    db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
    recordAudit(req, { action: 'delete', entity: 'tournament', entityId: existing.id, before: existing });
    res.json({ ok: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// --- Groups management ---

router.get('/:id/groups', (req, res) => {
  const groups = db.prepare('SELECT * FROM groups_ WHERE tournament_id = ? ORDER BY sort_order').all(req.params.id);
  const groupTeams = db.prepare(`
    SELECT gt.*, tm.name as team_name, tm.code as team_code, tm.flag as team_flag
    FROM group_teams gt JOIN teams tm ON tm.id = gt.team_id
    WHERE gt.group_id IN (SELECT id FROM groups_ WHERE tournament_id = ?)
    ORDER BY gt.seed_order
  `).all(req.params.id);
  for (const g of groups) g.teams = groupTeams.filter(gt => gt.group_id === g.id);
  res.json({ items: groups });
});

router.post('/:id/groups', requireRole(...WRITE_ROLES), (req, res) => {
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });
  const { name, team_ids } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المجموعة مطلوب' });
  const count = db.prepare('SELECT COUNT(*) c FROM groups_ WHERE tournament_id = ?').get(req.params.id).c;
  try {
    const info = db.prepare('INSERT INTO groups_ (tournament_id, name, sort_order) VALUES (?, ?, ?)').run(req.params.id, name, count);
    const groupId = info.lastInsertRowid;
    if (Array.isArray(team_ids)) {
      const stmt = db.prepare('INSERT INTO group_teams (group_id, team_id, seed_order) VALUES (?, ?, ?)');
      team_ids.forEach((teamId, idx) => stmt.run(groupId, teamId, idx));
    }
    const created = db.prepare('SELECT * FROM groups_ WHERE id = ?').get(groupId);
    recordAudit(req, { action: 'create', entity: 'group', entityId: groupId, after: created });
    res.status(201).json({ item: created });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.put('/:id/groups/:groupId', requireRole(...WRITE_ROLES), (req, res) => {
  const group = db.prepare('SELECT * FROM groups_ WHERE id = ? AND tournament_id = ?').get(req.params.groupId, req.params.id);
  if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });
  const { name, team_ids } = req.body || {};
  try {
    if (name) db.prepare('UPDATE groups_ SET name = ? WHERE id = ?').run(name, group.id);
    if (Array.isArray(team_ids)) {
      db.prepare('DELETE FROM group_teams WHERE group_id = ?').run(group.id);
      const stmt = db.prepare('INSERT INTO group_teams (group_id, team_id, seed_order) VALUES (?, ?, ?)');
      team_ids.forEach((teamId, idx) => stmt.run(group.id, teamId, idx));
    }
    const updated = db.prepare('SELECT * FROM groups_ WHERE id = ?').get(group.id);
    recordAudit(req, { action: 'update', entity: 'group', entityId: group.id, before: group, after: updated });
    res.json({ item: updated });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/:id/groups/:groupId/approve', requireRole('admin', 'tournament_manager'), (req, res) => {
  const group = db.prepare('SELECT * FROM groups_ WHERE id = ? AND tournament_id = ?').get(req.params.groupId, req.params.id);
  if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });
  const teamCount = db.prepare('SELECT COUNT(*) c FROM group_teams WHERE group_id = ?').get(group.id).c;
  if (teamCount < 2) {
    return res.status(422).json({ error: 'لا يمكن اعتماد مجموعة تضم أقل من فريقين', code: 'BUSINESS_RULE' });
  }
  const approved = req.body && typeof req.body.approved === 'boolean' ? req.body.approved : true;
  db.prepare('UPDATE groups_ SET approved = ? WHERE id = ?').run(approved ? 1 : 0, group.id);
  const updated = db.prepare('SELECT * FROM groups_ WHERE id = ?').get(group.id);
  recordAudit(req, { action: approved ? 'approve' : 'unapprove', entity: 'group', entityId: group.id, before: group, after: updated });
  res.json({ item: updated });
});

router.delete('/:id/groups/:groupId', requireRole(...WRITE_ROLES), (req, res) => {
  const group = db.prepare('SELECT * FROM groups_ WHERE id = ? AND tournament_id = ?').get(req.params.groupId, req.params.id);
  if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });
  const matchCount = db.prepare('SELECT COUNT(*) c FROM matches WHERE group_id = ?').get(group.id).c;
  if (matchCount > 0) return res.status(409).json({ error: 'لا يمكن حذف مجموعة لديها مباريات مرتبطة', code: 'REFERENCED' });
  db.prepare('DELETE FROM groups_ WHERE id = ?').run(group.id);
  recordAudit(req, { action: 'delete', entity: 'group', entityId: group.id, before: group });
  res.json({ ok: true });
});

module.exports = router;
