const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/overview', (req, res) => {
  const counts = {
    tournaments: db.prepare('SELECT COUNT(*) c FROM tournaments').get().c,
    teams: db.prepare('SELECT COUNT(*) c FROM teams').get().c,
    players: db.prepare('SELECT COUNT(*) c FROM players').get().c,
    matches: db.prepare('SELECT COUNT(*) c FROM matches').get().c,
    goals: db.prepare(`SELECT COALESCE(SUM(home_score),0) + COALESCE(SUM(away_score),0) as c FROM matches WHERE status='finished' AND approved=1`).get().c,
  };
  const recentMatches = db.prepare(`
    SELECT m.*, th.name as home_team_name, ta.name as away_team_name, t.name as tournament_name
    FROM matches m
    JOIN teams th ON th.id = m.home_team_id
    JOIN teams ta ON ta.id = m.away_team_id
    JOIN tournaments t ON t.id = m.tournament_id
    ORDER BY m.match_date DESC LIMIT 5
  `).all();
  const byCategory = db.prepare(`
    SELECT t.category, COUNT(*) as c FROM matches m JOIN tournaments t ON t.id = m.tournament_id GROUP BY t.category
  `).all();
  res.json({ counts, recentMatches, byCategory });
});

module.exports = router;
