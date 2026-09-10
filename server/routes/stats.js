const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/scorers', (req, res) => {
  const { tournament_id, category } = req.query;
  const clauses = ["m.status = 'finished'", 'm.approved = 1'];
  const params = [];
  if (tournament_id) { clauses.push('m.tournament_id = ?'); params.push(tournament_id); }
  if (category) { clauses.push('t.category = ?'); params.push(category); }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT p.id as player_id, p.name as player_name, tm.name as team_name, tm.code as team_code, COUNT(*) as goals
    FROM match_events me
    JOIN matches m ON m.id = me.match_id
    JOIN tournaments t ON t.id = m.tournament_id
    JOIN players p ON p.id = me.player_id
    JOIN teams tm ON tm.id = me.team_id
    ${where}
    GROUP BY p.id, tm.id
    ORDER BY goals DESC, p.name
    LIMIT 50
  `).all(...params);
  res.json({ items: rows });
});

router.get('/minutes', (req, res) => {
  const { tournament_id, category } = req.query;
  const clauses = [];
  const params = [];
  if (tournament_id) { clauses.push('m.tournament_id = ?'); params.push(tournament_id); }
  if (category) { clauses.push('t.category = ?'); params.push(category); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT p.id as player_id, p.name as player_name, tm.name as team_name, tm.code as team_code,
      SUM(ml.minutes_played) as minutes, COUNT(*) as appearances
    FROM match_lineups ml
    JOIN matches m ON m.id = ml.match_id
    JOIN tournaments t ON t.id = m.tournament_id
    JOIN players p ON p.id = ml.player_id
    JOIN teams tm ON tm.id = ml.team_id
    ${where}
    GROUP BY p.id, tm.id
    ORDER BY minutes DESC, p.name
    LIMIT 50
  `).all(...params);
  res.json({ items: rows });
});

module.exports = router;
