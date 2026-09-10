import { el, clear, loadingRow, emptyState } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';

export async function renderStatistics() {
  const main = getMain();
  clear(main);

  let activeTab = 'standings';
  let selectedTournament = '';
  let tournaments = [];
  try { tournaments = (await api.get('/tournaments')).items; } catch (_) { /* ignore */ }

  main.appendChild(pageHeader('الإحصائيات', 'تحليلات شاملة عبر البطولات والفئات'));

  const tabs = [
    { key: 'standings', label: 'جدول الترتيب' },
    { key: 'scorers', label: 'الهدافون' },
    { key: 'minutes', label: 'دقائق اللعب' },
  ];
  const tabsEl = el('div', { class: 'tabs' });
  const contentEl = el('div', { id: 'stats-content' });

  function paintTabs() {
    clear(tabsEl);
    tabs.forEach((t) => tabsEl.appendChild(el('button', {
      class: t.key === activeTab ? 'active' : '',
      onclick: () => { activeTab = t.key; paintTabs(); paintContent(); },
    }, t.label)));
  }

  const tournamentSelect = el('select', {
    onchange: (e) => { selectedTournament = e.target.value; paintContent(); },
  }, [el('option', { value: '' }, 'اختر بطولة'), ...tournaments.map((t) => el('option', { value: t.id }, t.name))]);

  async function paintContent() {
    clear(contentEl);
    if (!selectedTournament) {
      contentEl.appendChild(emptyState('اختر بطولة لعرض ' + (activeTab === 'standings' ? 'الترتيب' : activeTab === 'scorers' ? 'الهدافين' : 'دقائق اللعب'), null, '📊'));
      return;
    }
    contentEl.appendChild(loadingRow());
    try {
      if (activeTab === 'standings') {
        const { items } = await api.get(`/tournaments/${selectedTournament}/standings`);
        clear(contentEl);
        if (items.length === 0) { contentEl.appendChild(emptyState('لا توجد مجموعات لهذه البطولة', null, '📋')); return; }
        for (const { group, standings } of items) {
          const block = el('div', { class: 'group-block' }, [el('h4', {}, group.name)]);
          const table = el('table', {}, [
            el('thead', {}, el('tr', {}, ['#', 'المنتخب', 'لعب', 'فاز', 'تعادل', 'خسر', 'له', 'عليه', '+/-', 'نقاط'].map((h) => el('th', {}, h)))),
            el('tbody', {}, standings.map((s, i) => el('tr', {}, [
              el('td', {}, String(i + 1)),
              el('td', { style: 'font-weight:600;' }, `${s.flag || ''} ${s.name}`),
              el('td', {}, String(s.played)), el('td', {}, String(s.won)), el('td', {}, String(s.drawn)),
              el('td', { style: 'color:var(--danger);' }, String(s.lost)),
              el('td', {}, String(s.goals_for)), el('td', {}, String(s.goals_against)), el('td', {}, String(s.goal_diff)),
              el('td', { style: 'font-weight:700;' }, String(s.points)),
            ]))),
          ]);
          const card = el('div', { class: 'card' }, el('div', { class: 'table-wrap' }, table));
          block.appendChild(card);
          contentEl.appendChild(block);
        }
      } else if (activeTab === 'scorers') {
        const { items } = await api.get(`/stats/scorers?tournament_id=${selectedTournament}`);
        clear(contentEl);
        if (items.length === 0) { contentEl.appendChild(emptyState('لا توجد بيانات هدافين بعد', null, '⚽')); return; }
        const table = el('table', {}, [
          el('thead', {}, el('tr', {}, ['#', 'اللاعب', 'المنتخب', 'الأهداف'].map((h) => el('th', {}, h)))),
          el('tbody', {}, items.map((p, i) => el('tr', {}, [
            el('td', {}, String(i + 1)), el('td', { style: 'font-weight:600;' }, p.player_name),
            el('td', {}, `${p.team_code} · ${p.team_name}`), el('td', {}, el('span', { class: 'badge badge-gold' }, p.goals)),
          ]))),
        ]);
        contentEl.appendChild(el('div', { class: 'card' }, el('div', { class: 'table-wrap' }, table)));
      } else if (activeTab === 'minutes') {
        const { items } = await api.get(`/stats/minutes?tournament_id=${selectedTournament}`);
        clear(contentEl);
        if (items.length === 0) { contentEl.appendChild(emptyState('لا توجد بيانات دقائق لعب بعد', null, '⏱️')); return; }
        const table = el('table', {}, [
          el('thead', {}, el('tr', {}, ['#', 'اللاعب', 'المنتخب', 'المباريات', 'الدقائق'].map((h) => el('th', {}, h)))),
          el('tbody', {}, items.map((p, i) => el('tr', {}, [
            el('td', {}, String(i + 1)), el('td', { style: 'font-weight:600;' }, p.player_name),
            el('td', {}, `${p.team_code} · ${p.team_name}`), el('td', {}, String(p.appearances)),
            el('td', {}, el('span', { class: 'badge' }, `${p.minutes}′`)),
          ]))),
        ]);
        contentEl.appendChild(el('div', { class: 'card' }, el('div', { class: 'table-wrap' }, table)));
      }
    } catch (err) { clear(contentEl); reportError(err); }
  }

  paintTabs();
  main.appendChild(tabsEl);
  main.appendChild(el('div', { class: 'toolbar' }, [tournamentSelect]));
  main.appendChild(contentEl);
  paintContent();
}
