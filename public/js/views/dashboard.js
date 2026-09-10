import { el, clear, loadingRow, formatDateTime } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';
import { navigate } from '../router.js';

const STAT_DEFS = [
  { key: 'tournaments', label: 'البطولات', icon: '🏆', path: '/tournaments' },
  { key: 'teams', label: 'المنتخبات', icon: '🛡️', path: '/teams' },
  { key: 'players', label: 'اللاعبون', icon: '👥', path: '/players' },
  { key: 'matches', label: 'المباريات', icon: '📅', path: '/matches' },
  { key: 'goals', label: 'الأهداف', icon: '⚽', path: '/statistics' },
];

export async function renderDashboard() {
  const main = getMain();
  clear(main);
  main.appendChild(pageHeader('نظرة عامة', 'صورة سريعة عن حالة النظام'));
  main.appendChild(loadingRow());

  let data;
  try {
    data = await api.get('/dashboard/overview');
  } catch (err) {
    reportError(err);
    return;
  }
  clear(main);
  main.appendChild(pageHeader('نظرة عامة', 'صورة سريعة عن حالة النظام'));

  const statsGrid = el('div', { class: 'grid grid-cols-5', style: 'margin-bottom:20px;' },
    STAT_DEFS.map((def) => el('div', {
      class: 'stat-card',
      style: 'cursor:pointer',
      onclick: () => navigate(def.path),
    }, [
      el('div', { class: 'body' }, [
        el('div', { class: 'label' }, def.label),
        el('div', { class: 'value' }, String(data.counts[def.key] ?? 0)),
      ]),
      el('div', { class: 'icon' }, def.icon),
    ]))
  );
  main.appendChild(statsGrid);

  const contentGrid = el('div', { class: 'grid grid-cols-2' });

  const recentCard = el('div', { class: 'card' }, [
    el('h3', {}, 'أحدث المباريات'),
    data.recentMatches.length === 0
      ? el('p', { class: 'text-muted' }, 'لا توجد مباريات بعد')
      : el('div', {}, data.recentMatches.map((m) => el('div', {
          style: 'display:flex;align-items:center;justify-content:space-between;padding:12px 4px;border-bottom:1px solid var(--border);gap:10px;',
        }, [
          el('span', { style: 'font-weight:600;flex:1;text-align:right;' }, m.home_team_name),
          el('span', { class: `score-pill ${m.status === 'finished' ? '' : 'muted'}` },
            m.status === 'finished' ? `${m.home_score} - ${m.away_score}` : 'لم تُلعب'),
          el('span', { style: 'font-weight:600;flex:1;text-align:left;' }, m.away_team_name),
        ]))),
  ]);

  const maxCount = Math.max(1, ...data.byCategory.map((c) => c.c));
  const chartCard = el('div', { class: 'card' }, [
    el('h3', {}, 'المباريات حسب الفئة'),
    data.byCategory.length === 0
      ? el('p', { class: 'text-muted' }, 'لا توجد بيانات بعد')
      : el('div', { style: 'display:flex;align-items:flex-end;gap:24px;height:180px;padding-top:10px;' },
          data.byCategory.map((c) => el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:8px;flex:1;height:100%;justify-content:flex-end;' }, [
            el('div', { class: 'text-muted mono', style: 'font-size:12px;' }, String(c.c)),
            el('div', {
              style: `width:60%;max-width:70px;background:var(--green-mid);border-radius:6px 6px 0 0;height:${Math.max(6, (c.c / maxCount) * 130)}px;`,
            }),
            el('div', { style: 'font-size:12px;color:var(--text-secondary);font-weight:600;' }, c.category),
          ]))),
  ]);

  contentGrid.appendChild(recentCard);
  contentGrid.appendChild(chartCard);
  main.appendChild(contentGrid);
}
