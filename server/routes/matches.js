const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../audit');
const { handleDbError, paginationParams } = require('../util');

const router = express.Router();
const ENTER_ROLES = ['admin', 'tournament_manager', 'data_entry'];
const APPROVE_ROLES = ['admin', 'tournament_manager', 'results_reviewer'];
const DELETE_ROLES = ['admin', 'tournament_manager'];

router.use(requireAuth);

const MATCH_SELECT = `
  SELECT m.*,
    th.name as home_team_name, th.code as home_team_code, th.flag as home_team_flag,
    ta.name as away_team_name, ta.code as away_team_code, ta.flag as away_team_flag,
    t.name as tournament_name, t.category as tournament_category,
    g.name as group_name
  FROM matches m
  JOIN teams th ON th.id = m.home_team_id
  JOIN teams ta ON ta.id = m.away_team_id
  JOIN tournaments t ON t.id = m.tournament_id
  LEFT JOIN groups_ g ON g.id = m.group_id
`;

router.get('/', (req, res) => {
  const { tournament_id, team_id, status, stage, category } = req.query;
  const clauses = [];
  const params = [];
  if (tournament_id) { clauses.push('m.tournament_id = ?'); params.push(tournament_id); }
  if (team_id) { clauses.push('(m.home_team_id = ? OR m.away_team_id = ?)'); params.push(team_id, team_id); }
  if (status) { clauses.push('m.status = ?'); params.push(status); }
  if (stage) { clauses.push('m.stage = ?'); params.push(stage); }
  if (category) { clauses.push('t.category = ?'); params.push(category); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { page, limit, offset } = paginationParams(req.query, 25, 100);
  const total = db.prepare(`SELECT COUNT(*) c FROM matches m JOIN tournaments t ON t.id = m.tournament_id ${where}`).get(...params).c;
  const rows = db.prepare(`${MATCH_SELECT} ${where} ORDER BY m.match_date DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ items: rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/:id', (req, res) => {
  const match = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(req.params.id);
  if (!match) return res.status(404).json({ error: 'المباراة غير موجودة' });
  const events = db.prepare(`
    SELECT me.*, p.name as player_name, p.number as player_number, tm.name as team_name
    FROM match_events me JOIN players p ON p.id = me.player_id JOIN teams tm ON tm.id = me.team_id
    WHERE me.match_id = ? ORDER BY me.minute
  `).all(match.id);
  const lineups = db.prepare(`
    SELECT ml.*, p.name as player_name, p.number as player_number, tm.name as team_name
    FROM match_lineups ml JOIN players p ON p.id = ml.player_id JOIN teams tm ON tm.id = ml.team_id
    WHERE ml.match_id = ? ORDER BY tm.id, p.number
  `).all(match.id);
  res.json({ item: match, events, lineups });
});

router.post('/', requireRole(...ENTER_ROLES), (req, res) => {
  const { tournament_id, group_id, stage, home_team_id, away_team_id, match_date } = req.body || {};
  if (!tournament_id || !stage || !home_team_id || !away_team_id || !match_date) {
    return res.status(400).json({ error: 'جميع بيانات المباراة الأساسية مطلوبة' });
  }
  if (String(home_team_id) === String(away_team_id)) {
    return res.status(400).json({ error: 'لا يجوز أن يواجه الفريق نفسه' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO matches (tournament_id, group_id, stage, home_team_id, away_team_id, match_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tournament_id, group_id || null, stage, home_team_id, away_team_id, match_date);
    const created = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(info.lastInsertRowid);
    recordAudit(req, { action: 'create', entity: 'match', entityId: created.id, after: created });
    res.status(201).json({ item: created });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.put('/:id', requireRole(...ENTER_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المباراة غير موجودة' });
  const { match_date, home_team_id, away_team_id, group_id } = req.body || {};
  const merged = {
    match_date: match_date ?? existing.match_date,
    home_team_id: home_team_id ?? existing.home_team_id,
    away_team_id: away_team_id ?? existing.away_team_id,
    group_id: group_id !== undefined ? group_id : existing.group_id,
  };
  if (String(merged.home_team_id) === String(merged.away_team_id)) {
    return res.status(400).json({ error: 'لا يجوز أن يواجه الفريق نفسه' });
  }
  try {
    db.prepare(`
      UPDATE matches SET match_date=?, home_team_id=?, away_team_id=?, group_id=?, updated_at=datetime('now') WHERE id=?
    `).run(merged.match_date, merged.home_team_id, merged.away_team_id, merged.group_id, req.params.id);
    const updated = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(req.params.id);
    recordAudit(req, { action: 'update', entity: 'match', entityId: updated.id, before: existing, after: updated });
    res.json({ item: updated });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Enter/update the result of a match. Enforces the knockout no-draw business rule.
router.put('/:id/result', requireRole(...ENTER_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المباراة غير موجودة' });
  const { home_score, away_score, home_penalties, away_penalties, status } = req.body || {};
  const nextStatus = status || 'finished';

  if (nextStatus === 'finished') {
    if (home_score === undefined || home_score === null || away_score === undefined || away_score === null) {
      return res.status(400).json({ error: 'الرجاء إدخال نتيجة المباراة كاملة' });
    }
    if (home_score < 0 || away_score < 0) {
      return res.status(400).json({ error: 'لا يمكن أن تكون النتيجة سالبة' });
    }
    let penH = home_penalties;
    let penA = away_penalties;
    if (existing.stage !== 'group' && Number(home_score) === Number(away_score)) {
      if (penH === undefined || penH === null || penA === undefined || penA === null) {
        return res.status(422).json({
          error: 'لا يقبل النظام تعادلًا في مباراة إقصائية. الرجاء إدخال نتيجة ركلات الترجيح لتحديد الفائز.',
          code: 'DRAW_NOT_ALLOWED',
        });
      }
      if (Number(penH) === Number(penA)) {
        return res.status(422).json({ error: 'نتيجة ركلات الترجيح يجب أن تحدد فائزًا واضحًا', code: 'DRAW_NOT_ALLOWED' });
      }
    } else if (existing.stage === 'group') {
      penH = null;
      penA = null;
    }
    db.prepare(`
      UPDATE matches SET home_score=?, away_score=?, home_penalties=?, away_penalties=?, status='finished', approved=0, updated_at=datetime('now')
      WHERE id=?
    `).run(home_score, away_score, penH ?? null, penA ?? null, req.params.id);
  } else {
    db.prepare(`
      UPDATE matches SET status='scheduled', home_score=NULL, away_score=NULL, home_penalties=NULL, away_penalties=NULL, approved=0, updated_at=datetime('now')
      WHERE id=?
    `).run(req.params.id);
  }
  const updated = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(req.params.id);
  recordAudit(req, { action: 'enter_result', entity: 'match', entityId: updated.id, before: existing, after: updated });
  res.json({ item: updated });
});

router.post('/:id/approve', requireRole(...APPROVE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المباراة غير موجودة' });
  if (existing.status !== 'finished') {
    return res.status(422).json({ error: 'لا يمكن اعتماد نتيجة مباراة لم تنتهِ بعد', code: 'BUSINESS_RULE' });
  }
  const approved = req.body && typeof req.body.approved === 'boolean' ? req.body.approved : true;
  db.prepare('UPDATE matches SET approved = ? WHERE id = ?').run(approved ? 1 : 0, req.params.id);
  const updated = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(req.params.id);
  recordAudit(req, { action: approved ? 'approve_result' : 'reject_result', entity: 'match', entityId: updated.id, before: existing, after: updated });
  res.json({ item: updated });
});

router.delete('/:id', requireRole(...DELETE_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'المباراة غير موجودة' });
  db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
  recordAudit(req, { action: 'delete', entity: 'match', entityId: existing.id, before: existing });
  res.json({ ok: true });
});

// --- Match events (goals) & lineups (minutes played) ---

router.post('/:id/events', requireRole(...ENTER_ROLES), (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'المباراة غير موجودة' });
  const { team_id, player_id, minute } = req.body || {};
  if (!team_id || !player_id || minute === undefined || minute === null) {
    return res.status(400).json({ error: 'الفريق واللاعب والدقيقة مطلوبة' });
  }
  if (String(team_id) !== String(match.home_team_id) && String(team_id) !== String(match.away_team_id)) {
    return res.status(400).json({ error: 'الفريق المحدد لا يشارك في هذه المباراة' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO match_events (match_id, team_id, player_id, type, minute) VALUES (?, ?, ?, 'goal', ?)
    `).run(match.id, team_id, player_id, minute);
    const created = db.prepare('SELECT * FROM match_events WHERE id = ?').get(info.lastInsertRowid);
    recordAudit(req, { action: 'create', entity: 'match_event', entityId: created.id, after: created });
    res.status(201).json({ item: created });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:id/events/:eventId', requireRole(...ENTER_ROLES), (req, res) => {
  const existing = db.prepare('SELECT * FROM match_events WHERE id = ? AND match_id = ?').get(req.params.eventId, req.params.id);
  if (!existing) return res.status(404).json({ error: 'الحدث غير موجود' });
  db.prepare('DELETE FROM match_events WHERE id = ?').run(req.params.eventId);
  recordAudit(req, { action: 'delete', entity: 'match_event', entityId: existing.id, before: existing });
  res.json({ ok: true });
});

router.put('/:id/lineups', requireRole(...ENTER_ROLES), (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'المباراة غير موجودة' });
  const { lineups } = req.body || {};
  if (!Array.isArray(lineups)) return res.status(400).json({ error: 'قائمة التشكيلة مطلوبة' });
  const del = db.prepare('DELETE FROM match_lineups WHERE match_id = ?');
  const ins = db.prepare('INSERT INTO match_lineups (match_id, team_id, player_id, minutes_played) VALUES (?, ?, ?, ?)');
  try {
    del.run(match.id);
    for (const l of lineups) {
      if (!l.team_id || !l.player_id) continue;
      ins.run(match.id, l.team_id, l.player_id, l.minutes_played ?? 90);
    }
    const result = db.prepare('SELECT * FROM match_lineups WHERE match_id = ?').all(match.id);
    recordAudit(req, { action: 'update', entity: 'match_lineups', entityId: match.id, after: { count: result.length } });
    res.json({ items: result });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;
