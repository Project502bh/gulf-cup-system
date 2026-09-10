import { api } from './api.js';
import { state } from './state.js';
import { route, startRouter, currentPath, navigate } from './router.js';
import { renderShell, highlightActiveNav } from './layout.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTournaments } from './views/tournaments.js';
import { renderTournamentDetail } from './views/tournamentDetail.js';
import { renderTeams } from './views/teams.js';
import { renderPlayers } from './views/players.js';
import { renderMatches } from './views/matches.js';
import { renderStatistics } from './views/statistics.js';
import { renderUsers } from './views/users.js';
import { renderAudit } from './views/audit.js';

function registerRoutes() {
  route('/dashboard', () => { renderDashboard(); highlightActiveNav(currentPath()); });
  route('/tournaments', () => { renderTournaments(); highlightActiveNav(currentPath()); });
  route('/tournaments/:id', (params) => { renderTournamentDetail(params); highlightActiveNav('/tournaments'); });
  route('/teams', () => { renderTeams(); highlightActiveNav(currentPath()); });
  route('/players', () => { renderPlayers(); highlightActiveNav(currentPath()); });
  route('/matches', () => { renderMatches(); highlightActiveNav(currentPath()); });
  route('/statistics', () => { renderStatistics(); highlightActiveNav(currentPath()); });
  route('/users', () => {
    if (state.user.role !== 'admin') { navigate('/dashboard'); return; }
    renderUsers();
    highlightActiveNav(currentPath());
  });
  route('/audit', () => {
    if (state.user.role !== 'admin') { navigate('/dashboard'); return; }
    renderAudit();
    highlightActiveNav(currentPath());
  });
}

function boot() {
  renderShell(currentPath());
  registerRoutes();
  startRouter();
}

async function init() {
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
    boot();
  } catch (_) {
    renderLogin((user) => {
      state.user = user;
      window.location.hash = '/dashboard';
      boot();
    });
  }
}

init();
