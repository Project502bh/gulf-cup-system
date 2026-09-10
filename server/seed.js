const bcrypt = require('bcryptjs');
const db = require('./db');

function runSeed() {
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (userCount > 0) {
    return false;
  }

  const insertUser = db.prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)');
  const users = [
    ['admin', 'admin123', 'مدير النظام', 'admin'],
    ['manager', 'manager123', 'خالد الفهد - مدير البطولة', 'tournament_manager'],
    ['entry', 'entry123', 'سارة العتيبي - مدخلة بيانات', 'data_entry'],
    ['reviewer', 'reviewer123', 'ناصر القحطاني - مراجع نتائج', 'results_reviewer'],
    ['viewer', 'viewer123', 'مشاهد التحليلات', 'viewer'],
  ];
  for (const [username, password, full_name, role] of users) {
    insertUser.run(username, bcrypt.hashSync(password, 10), full_name, role);
  }

  const insertTeam = db.prepare('INSERT INTO teams (name, country, code, coach, category, flag) VALUES (?, ?, ?, ?, ?, ?)');
  const teams = [
    ['المنتخب الكويتي', 'الكويت', 'KW', 'رودريغيز مندز', 'SENIOR', '🇰🇼'],
    ['المنتخب السعودي', 'المملكة العربية السعودية', 'SA', 'هيرفي رينارد', 'SENIOR', '🇸🇦'],
    ['المنتخب العراقي', 'العراق', 'IQ', 'كوستاس تساناس', 'SENIOR', '🇮🇶'],
    ['المنتخب العماني', 'عُمان', 'OM', 'برانكو إيفانكوفيتش', 'SENIOR', '🇴🇲'],
    ['المنتخب الإماراتي', 'الإمارات العربية المتحدة', 'AE', 'باولو بينتو', 'SENIOR', '🇦🇪'],
    ['المنتخب البحريني', 'البحرين', 'BH', 'حلمي طلياني', 'SENIOR', '🇧🇭'],
    ['المنتخب القطري', 'قطر', 'QA', 'بارتيلوني', 'SENIOR', '🇶🇦'],
    ['المنتخب اليمني', 'اليمن', 'YE', 'أحمد الكحلاني', 'SENIOR', '🇾🇪'],
  ];
  const teamIds = {};
  for (const [name, country, code, coach, category, flag] of teams) {
    const info = insertTeam.run(name, country, code, coach, category, flag);
    teamIds[code] = info.lastInsertRowid;
  }

  const positions = ['حارس مرمى', 'مدافع', 'وسط', 'مهاجم'];
  const insertPlayer = db.prepare('INSERT INTO players (name, number, position, team_id, category) VALUES (?, ?, ?, ?, ?)');
  const firstNames = ['محمد', 'أحمد', 'عبدالله', 'سلطان', 'فهد', 'خالد', 'سعود', 'ناصر', 'يوسف', 'علي', 'حمد', 'راشد', 'طارق', 'بندر', 'ماجد', 'وليد', 'زياد', 'عمر', 'إبراهيم', 'جاسم', 'مبارك', 'سالم', 'حسن', 'يعقوب'];
  Object.entries(teamIds).forEach(([code, teamId]) => {
    for (let i = 1; i <= 23; i++) {
      const name = `${firstNames[(i * 7 + code.charCodeAt(0)) % firstNames.length]} ${firstNames[(i * 3 + code.charCodeAt(1)) % firstNames.length]}`;
      const position = positions[i <= 3 ? 0 : i <= 10 ? 1 : i <= 18 ? 2 : 3];
      insertPlayer.run(name, i, position, teamId, 'SENIOR');
    }
  });

  const insertTournament = db.prepare(`
    INSERT INTO tournaments (name, category, year, host_country, host_city, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tInfo = insertTournament.run(
    'بطولة كأس الخليج 27', 'SENIOR', 2026,
    'المملكة العربية السعودية', 'جدة',
    '2026-09-23', '2026-10-10', 'ongoing'
  );
  const tournamentId = tInfo.lastInsertRowid;

  const insertGroup = db.prepare('INSERT INTO groups_ (tournament_id, name, sort_order, approved) VALUES (?, ?, ?, ?)');
  const groupAId = insertGroup.run(tournamentId, 'المجموعة أ', 0, 1).lastInsertRowid;
  const groupBId = insertGroup.run(tournamentId, 'المجموعة ب', 1, 1).lastInsertRowid;

  const insertGroupTeam = db.prepare('INSERT INTO group_teams (group_id, team_id, seed_order) VALUES (?, ?, ?)');
  const groupATeams = ['KW', 'SA', 'IQ', 'OM'].map(c => teamIds[c]);
  const groupBTeams = ['AE', 'BH', 'QA', 'YE'].map(c => teamIds[c]);
  groupATeams.forEach((id, idx) => insertGroupTeam.run(groupAId, id, idx));
  groupBTeams.forEach((id, idx) => insertGroupTeam.run(groupBId, id, idx));

  // Generate the group-stage round robin directly (mirrors the /system/generate-group-stage rule)
  // so the seeded tournament demonstrates a mid-flight state: most matches finished & approved,
  // a few still scheduled, so the knockout-generation gate has something real to show.
  db.prepare("INSERT INTO stage_locks (tournament_id, stage) VALUES (?, 'group_stage')").run(tournamentId);
  const insertMatch = db.prepare(`
    INSERT INTO matches (tournament_id, group_id, stage, round_order, home_team_id, away_team_id, match_date, status, approved, home_score, away_score)
    VALUES (?, ?, 'group', 1, ?, ?, ?, ?, ?, ?, ?)
  `);

  function roundRobinPairs(teamList) {
    const pairs = [];
    for (let i = 0; i < teamList.length; i++) {
      for (let j = i + 1; j < teamList.length; j++) pairs.push([teamList[i], teamList[j]]);
    }
    return pairs;
  }

  const allPairs = [...roundRobinPairs(groupATeams).map(p => ({ groupId: groupAId, pair: p })), ...roundRobinPairs(groupBTeams).map(p => ({ groupId: groupBId, pair: p }))];
  const scorelines = [[2, 1], [1, 0], [3, 1], [0, 0], [2, 2], [1, 1], [4, 0], [2, 0], [1, 2], [0, 1]];
  let dayOffset = 0;
  allPairs.forEach(({ groupId, pair }, idx) => {
    const matchDate = new Date('2026-09-23T15:00:00.000Z');
    matchDate.setDate(matchDate.getDate() + dayOffset);
    dayOffset += 1;
    const leaveScheduled = idx >= allPairs.length - 2; // last two matches stay unplayed
    if (leaveScheduled) {
      insertMatch.run(tournamentId, groupId, pair[0], pair[1], matchDate.toISOString(), 'scheduled', 0, null, null);
    } else {
      const [hs, as] = scorelines[idx % scorelines.length];
      insertMatch.run(tournamentId, groupId, pair[0], pair[1], matchDate.toISOString(), 'finished', 1, hs, as);
    }
  });

  // A handful of goal events for the finished matches so the top-scorers stat has data.
  const finishedMatches = db.prepare("SELECT * FROM matches WHERE tournament_id = ? AND status = 'finished'").all(tournamentId);
  const insertEvent = db.prepare("INSERT INTO match_events (match_id, team_id, player_id, type, minute) VALUES (?, ?, ?, 'goal', ?)");
  const insertLineup = db.prepare('INSERT INTO match_lineups (match_id, team_id, player_id, minutes_played) VALUES (?, ?, ?, ?)');
  for (const m of finishedMatches) {
    const homePlayers = db.prepare('SELECT id FROM players WHERE team_id = ? ORDER BY number LIMIT 11').all(m.home_team_id);
    const awayPlayers = db.prepare('SELECT id FROM players WHERE team_id = ? ORDER BY number LIMIT 11').all(m.away_team_id);
    homePlayers.forEach(p => insertLineup.run(m.id, m.home_team_id, p.id, 90));
    awayPlayers.forEach(p => insertLineup.run(m.id, m.away_team_id, p.id, 90));
    const attackers = homePlayers.slice(3);
    for (let g = 0; g < m.home_score && attackers.length; g++) {
      const scorer = attackers[g % attackers.length];
      insertEvent.run(m.id, m.home_team_id, scorer.id, 10 + g * 15);
    }
    const awayAttackers = awayPlayers.slice(3);
    for (let g = 0; g < m.away_score && awayAttackers.length; g++) {
      const scorer = awayAttackers[g % awayAttackers.length];
      insertEvent.run(m.id, m.away_team_id, scorer.id, 20 + g * 15);
    }
  }

  console.log('تمت تهيئة قاعدة البيانات ببيانات تجريبية بنجاح.');
  console.log('حسابات الدخول:');
  users.forEach(([username, password, , role]) => console.log(`  - ${username} / ${password}  (${role})`));
  return true;
}

if (require.main === module) {
  const seeded = runSeed();
  if (!seeded) {
    console.log('البيانات موجودة مسبقًا. لإعادة التهيئة احذف ملف data/gulf-cup.db أولًا.');
  }
}

module.exports = { runSeed };
