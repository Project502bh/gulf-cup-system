const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'gulf-cup.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','tournament_manager','data_entry','results_reviewer','viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  host_country TEXT NOT NULL,
  host_city TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','ongoing','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  code TEXT NOT NULL,
  coach TEXT,
  category TEXT NOT NULL,
  flag TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  number INTEGER NOT NULL,
  position TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups_ (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  seed_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_id, team_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups_(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (stage IN ('group','semifinal','final','third_place')),
  round_order INTEGER NOT NULL DEFAULT 0,
  home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  match_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','finished')),
  approved INTEGER NOT NULL DEFAULT 0,
  home_score INTEGER,
  away_score INTEGER,
  home_penalties INTEGER,
  away_penalties INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (home_team_id <> away_team_id)
);

CREATE TABLE IF NOT EXISTS match_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  type TEXT NOT NULL DEFAULT 'goal' CHECK (type IN ('goal')),
  minute INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS match_lineups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  minutes_played INTEGER NOT NULL DEFAULT 90,
  UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS stage_locks (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('group_stage','knockouts','finals')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tournament_id, stage)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_category ON players(category);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_group ON matches(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_stage ON matches(tournament_id, stage);
CREATE INDEX IF NOT EXISTS idx_group_teams_group ON group_teams(group_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`);

module.exports = db;
