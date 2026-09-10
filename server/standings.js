const db = require('./db');

// Computes the standings table for a single group from finished & approved matches only,
// per the confirmed rule: points desc, then goal difference, then goals scored.
// Any further tie-break beyond that is an open decision (see PRD "القرارات المفتوحة").
function computeGroupStandings(groupId) {
  const teams = db.prepare(`
    SELECT gt.team_id, t.name, t.code, t.flag
    FROM group_teams gt JOIN teams t ON t.id = gt.team_id
    WHERE gt.group_id = ?
    ORDER BY gt.seed_order
  `).all(groupId);

  const table = new Map();
  for (const t of teams) {
    table.set(t.team_id, {
      team_id: t.team_id, name: t.name, code: t.code, flag: t.flag,
      played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, goal_diff: 0, points: 0,
    });
  }

  const matches = db.prepare(`
    SELECT * FROM matches WHERE group_id = ? AND stage = 'group' AND status = 'finished' AND approved = 1
  `).all(groupId);

  for (const m of matches) {
    const home = table.get(m.home_team_id);
    const away = table.get(m.away_team_id);
    if (!home || !away) continue;
    home.played += 1; away.played += 1;
    home.goals_for += m.home_score; home.goals_against += m.away_score;
    away.goals_for += m.away_score; away.goals_against += m.home_score;
    if (m.home_score > m.away_score) { home.won += 1; home.points += 3; away.lost += 1; }
    else if (m.home_score < m.away_score) { away.won += 1; away.points += 3; home.lost += 1; }
    else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; }
  }

  const rows = Array.from(table.values());
  for (const r of rows) r.goal_diff = r.goals_for - r.goals_against;
  rows.sort((a, b) => b.points - a.points || b.goal_diff - a.goal_diff || b.goals_for - a.goals_for || a.name.localeCompare(b.name, 'ar'));
  return rows;
}

function isGroupStageComplete(tournamentId) {
  const row = db.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN status = 'finished' AND approved = 1 THEN 1 ELSE 0 END) as done
    FROM matches WHERE tournament_id = ? AND stage = 'group'
  `).get(tournamentId);
  return row.total > 0 && row.total === row.done;
}

module.exports = { computeGroupStandings, isGroupStageComplete };
