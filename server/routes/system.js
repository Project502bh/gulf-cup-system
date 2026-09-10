const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../audit');
const { withTransaction } = require('../util');
const { computeGroupStandings, isGroupStageComplete } = require('../standings');

const router = express.Router();
const GENERATE_ROLES = ['admin', 'tournament_manager'];

router.use(requireAuth);

function getTournament(id) {
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
}

function getGroups(tournamentId) {
  return db.prepare('SELECT * FROM groups_ WHERE tournament_id = ? ORDER BY sort_order').all(tournamentId);
}

function hasLock(tournamentId, stage) {
  return !!db.prepare('SELECT 1 FROM stage_locks WHERE tournament_id = ? AND stage = ?').get(tournamentId, stage);
}

function countGroupTeams(groupId) {
  return db.prepare('SELECT COUNT(*) c FROM group_teams WHERE group_id = ?').get(groupId).c;
}

function buildStatus(tournamentId) {
  const groups = getGroups(tournamentId);
  const groupCount = groups.length;
  const groupsApproved = groupCount > 0 && groups.every(g => g.approved === 1);
  const groupsHaveEnoughTeams = groups.every(g => countGroupTeams(g.id) >= 2);

  const groupStageGenerated = hasLock(tournamentId, 'group_stage');
  const knockoutsGenerated = hasLock(tournamentId, 'knockouts');
  const finalsGenerated = hasLock(tournamentId, 'finals');

  const groupStageComplete = groupStageGenerated && isGroupStageComplete(tournamentId);

  const semifinals = db.prepare(`SELECT * FROM matches WHERE tournament_id = ? AND stage = 'semifinal' ORDER BY round_order`).all(tournamentId);
  const hasSemifinals = semifinals.length > 0;
  const semifinalsComplete = hasSemifinals && semifinals.length === 2 && semifinals.every(m => m.status === 'finished' && m.approved === 1);

  const finalMatch = db.prepare(`SELECT * FROM matches WHERE tournament_id = ? AND stage = 'final'`).get(tournamentId);
  const thirdPlaceMatch = db.prepare(`SELECT * FROM matches WHERE tournament_id = ? AND stage = 'third_place'`).get(tournamentId);

  let canGenerateGroupStage = true;
  let groupStageReason = null;
  if (groupStageGenerated) { canGenerateGroupStage = false; groupStageReason = 'تم توليد دور المجموعات مسبقًا'; }
  else if (groupCount !== 2) { canGenerateGroupStage = false; groupStageReason = `يتطلب توليد دور المجموعات وجود مجموعتين بالضبط (العدد الحالي: ${groupCount})`; }
  else if (!groupsApproved) { canGenerateGroupStage = false; groupStageReason = 'لم تُعتمد جميع المجموعات بعد'; }
  else if (!groupsHaveEnoughTeams) { canGenerateGroupStage = false; groupStageReason = 'كل مجموعة تحتاج فريقين على الأقل'; }

  let canGenerateKnockouts = true;
  let knockoutsReason = null;
  if (knockoutsGenerated) { canGenerateKnockouts = false; knockoutsReason = 'تم توليد أدوار نصف النهائي مسبقًا'; }
  else if (!groupStageGenerated) { canGenerateKnockouts = false; knockoutsReason = 'لم يتم توليد دور المجموعات بعد'; }
  else if (!groupStageComplete) { canGenerateKnockouts = false; knockoutsReason = 'لا يمكن توليد نصف النهائي قبل انتهاء واعتماد جميع مباريات المجموعات'; }
  else if (groupCount !== 2) { canGenerateKnockouts = false; knockoutsReason = 'يتطلب المسار الإقصائي وجود مجموعتين بالضبط'; }

  let canGenerateFinals = true;
  let finalsReason = null;
  if (finalsGenerated) { canGenerateFinals = false; finalsReason = 'تم توليد النهائي ومباراة المركز الثالث مسبقًا'; }
  else if (!hasSemifinals) { canGenerateFinals = false; finalsReason = 'لم يتم توليد مباراتي نصف النهائي بعد'; }
  else if (!semifinalsComplete) { canGenerateFinals = false; finalsReason = 'لا يمكن توليد النهائيات قبل انتهاء واعتماد مباراتي نصف النهائي بفائز حاسم'; }

  return {
    tournamentId: Number(tournamentId),
    groupCount,
    groupsApproved,
    groupStageGenerated,
    groupStageComplete,
    hasSemifinals,
    semifinalsComplete,
    hasFinal: !!finalMatch,
    hasThirdPlace: !!thirdPlaceMatch,
    canGenerateGroupStage,
    canGenerateKnockouts,
    canGenerateFinals,
    reasons: {
      groupStage: groupStageReason,
      knockouts: knockoutsReason,
      finals: finalsReason,
    },
  };
}

router.get('/:id/system/status', (req, res) => {
  const tournament = getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });
  res.json(buildStatus(req.params.id));
});

function scheduleDate(startDate, offsetDays) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(15, 0, 0, 0);
  return d.toISOString();
}

router.post('/:id/system/generate-group-stage', requireRole(...GENERATE_ROLES), (req, res) => {
  const tournament = getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });

  const groups = getGroups(tournament.id);
  if (groups.length !== 2) {
    return res.status(422).json({ error: `يتطلب توليد دور المجموعات وجود مجموعتين بالضبط (العدد الحالي: ${groups.length})`, code: 'BUSINESS_RULE' });
  }
  if (!groups.every(g => g.approved === 1)) {
    return res.status(422).json({ error: 'لا يمكن توليد دور المجموعات قبل اعتماد جميع المجموعات', code: 'BUSINESS_RULE' });
  }
  const groupTeams = groups.map(g => ({
    group: g,
    teams: db.prepare('SELECT team_id FROM group_teams WHERE group_id = ? ORDER BY seed_order').all(g.id).map(r => r.team_id),
  }));
  if (groupTeams.some(gt => gt.teams.length < 2)) {
    return res.status(422).json({ error: 'كل مجموعة تحتاج فريقين على الأقل لتوليد المباريات', code: 'BUSINESS_RULE' });
  }

  try {
    const created = withTransaction(db, () => {
      db.prepare('INSERT INTO stage_locks (tournament_id, stage) VALUES (?, ?)').run(tournament.id, 'group_stage');
      const insertMatch = db.prepare(`
        INSERT INTO matches (tournament_id, group_id, stage, round_order, home_team_id, away_team_id, match_date)
        VALUES (?, ?, 'group', 1, ?, ?, ?)
      `);
      const inserted = [];
      let dayOffset = 0;
      for (const { group, teams } of groupTeams) {
        for (let i = 0; i < teams.length; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            const matchDate = scheduleDate(tournament.start_date, dayOffset);
            const info = insertMatch.run(tournament.id, group.id, teams[i], teams[j], matchDate);
            inserted.push(info.lastInsertRowid);
            dayOffset += 1;
          }
        }
      }
      return inserted;
    });
    recordAudit(req, { action: 'generate_group_stage', entity: 'tournament', entityId: tournament.id, after: { matches: created.length } });
    res.status(201).json({ createdMatches: created.length, status: buildStatus(tournament.id) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'تم توليد دور المجموعات مسبقًا', code: 'ALREADY_GENERATED' });
    }
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ داخلي أثناء توليد دور المجموعات' });
  }
});

router.post('/:id/system/generate-knockouts', requireRole(...GENERATE_ROLES), (req, res) => {
  const tournament = getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });

  const groups = getGroups(tournament.id);
  if (groups.length !== 2) {
    return res.status(422).json({ error: 'يتطلب المسار الإقصائي وجود مجموعتين بالضبط', code: 'BUSINESS_RULE' });
  }
  if (!hasLock(tournament.id, 'group_stage')) {
    return res.status(422).json({ error: 'لم يتم توليد دور المجموعات بعد', code: 'BUSINESS_RULE' });
  }
  if (!isGroupStageComplete(tournament.id)) {
    return res.status(422).json({ error: 'لا يمكن توليد نصف النهائي ما دامت أي مباراة مجموعات غير منتهية أو غير معتمدة', code: 'BUSINESS_RULE' });
  }

  const [groupA, groupB] = groups;
  const standingsA = computeGroupStandings(groupA.id);
  const standingsB = computeGroupStandings(groupB.id);
  if (standingsA.length < 2 || standingsB.length < 2) {
    return res.status(422).json({ error: 'يتطلب توليد نصف النهائي فريقين مؤهلين على الأقل من كل مجموعة', code: 'BUSINESS_RULE' });
  }
  const [a1, a2] = standingsA;
  const [b1, b2] = standingsB;

  try {
    const created = withTransaction(db, () => {
      db.prepare('INSERT INTO stage_locks (tournament_id, stage) VALUES (?, ?)').run(tournament.id, 'knockouts');
      const insertMatch = db.prepare(`
        INSERT INTO matches (tournament_id, stage, round_order, home_team_id, away_team_id, match_date)
        VALUES (?, 'semifinal', ?, ?, ?, ?)
      `);
      const d1 = scheduleDate(tournament.end_date, -2);
      const d2 = scheduleDate(tournament.end_date, -2);
      const sf1 = insertMatch.run(tournament.id, 1, a1.team_id, b2.team_id, d1);
      const sf2 = insertMatch.run(tournament.id, 2, b1.team_id, a2.team_id, d2);
      return [sf1.lastInsertRowid, sf2.lastInsertRowid];
    });
    recordAudit(req, { action: 'generate_knockouts', entity: 'tournament', entityId: tournament.id, after: { matches: created.length } });
    res.status(201).json({ createdMatches: created.length, status: buildStatus(tournament.id) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'تم توليد أدوار نصف النهائي مسبقًا', code: 'ALREADY_GENERATED' });
    }
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ داخلي أثناء توليد نصف النهائي' });
  }
});

function matchWinnerLoser(m) {
  let winner, loser;
  if (m.home_score > m.away_score) { winner = m.home_team_id; loser = m.away_team_id; }
  else if (m.away_score > m.home_score) { winner = m.away_team_id; loser = m.home_team_id; }
  else if (m.home_penalties !== null && m.away_penalties !== null && m.home_penalties > m.away_penalties) { winner = m.home_team_id; loser = m.away_team_id; }
  else if (m.home_penalties !== null && m.away_penalties !== null && m.away_penalties > m.home_penalties) { winner = m.away_team_id; loser = m.home_team_id; }
  return { winner, loser };
}

router.post('/:id/system/generate-finals', requireRole(...GENERATE_ROLES), (req, res) => {
  const tournament = getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });

  const semifinals = db.prepare(`SELECT * FROM matches WHERE tournament_id = ? AND stage = 'semifinal' ORDER BY round_order`).all(tournament.id);
  if (semifinals.length !== 2) {
    return res.status(422).json({ error: 'لم يتم توليد مباراتي نصف النهائي بعد', code: 'BUSINESS_RULE' });
  }
  if (!semifinals.every(m => m.status === 'finished' && m.approved === 1)) {
    return res.status(422).json({ error: 'لا يمكن توليد النهائي ومباراة المركز الثالث قبل انتهاء واعتماد مباراتي نصف النهائي', code: 'BUSINESS_RULE' });
  }
  const results = semifinals.map(matchWinnerLoser);
  if (results.some(r => !r.winner || !r.loser)) {
    return res.status(422).json({ error: 'لا يقبل النظام تعادلًا في مباراة إقصائية؛ يجب تحديد فائز وخاسر لكل مباراة نصف نهائي', code: 'DRAW_NOT_ALLOWED' });
  }

  try {
    const created = withTransaction(db, () => {
      db.prepare('INSERT INTO stage_locks (tournament_id, stage) VALUES (?, ?)').run(tournament.id, 'finals');
      const insertMatch = db.prepare(`
        INSERT INTO matches (tournament_id, stage, round_order, home_team_id, away_team_id, match_date)
        VALUES (?, ?, 1, ?, ?, ?)
      `);
      const finalDate = scheduleDate(tournament.end_date, 0);
      const thirdDate = scheduleDate(tournament.end_date, -1);
      const final = insertMatch.run(tournament.id, 'final', results[0].winner, results[1].winner, finalDate);
      const third = insertMatch.run(tournament.id, 'third_place', results[0].loser, results[1].loser, thirdDate);
      return [final.lastInsertRowid, third.lastInsertRowid];
    });
    recordAudit(req, { action: 'generate_finals', entity: 'tournament', entityId: tournament.id, after: { matches: created.length } });
    res.status(201).json({ createdMatches: created.length, status: buildStatus(tournament.id) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'تم توليد النهائي ومباراة المركز الثالث مسبقًا', code: 'ALREADY_GENERATED' });
    }
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ داخلي أثناء توليد النهائيات' });
  }
});

router.get('/:id/standings', (req, res) => {
  const tournament = getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });
  const groups = getGroups(tournament.id);
  const result = groups.map(g => ({ group: g, standings: computeGroupStandings(g.id) }));
  res.json({ items: result });
});

module.exports = router;
