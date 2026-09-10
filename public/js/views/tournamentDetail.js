import { el, clear, loadingRow, emptyState, formatDate, formatDateTime, CATEGORIES } from '../helpers.js';
import { TOURNAMENT_STATUS_LABELS, STAGE_LABELS } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';
import { navigate } from '../router.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { can } from '../state.js';
import { tournamentForm } from './tournaments.js';
import { matchResultForm, matchEventsPanel } from './matches.js';

const STAGE_PANEL_DEFS = [
  { key: 'groupStage', title: 'توليد دور المجموعات', endpoint: 'generate-group-stage', canKey: 'canGenerateGroupStage' },
  { key: 'knockouts', title: 'توليد نصف النهائي', endpoint: 'generate-knockouts', canKey: 'canGenerateKnockouts' },
  { key: 'finals', title: 'توليد النهائي ومباراة المركز الثالث', endpoint: 'generate-finals', canKey: 'canGenerateFinals' },
];

export async function renderTournamentDetail(params) {
  const main = getMain();
  clear(main);
  main.appendChild(loadingRow());

  const id = params.id;
  let tournamentData, status;
  try {
    [tournamentData, status] = await Promise.all([
      api.get(`/tournaments/${id}`),
      api.get(`/tournaments/${id}/system/status`),
    ]);
  } catch (err) {
    clear(main);
    reportError(err);
    return;
  }

  let activeTab = 'matches';
  const tournament = tournamentData.item;

  const rerender = async () => {
    try {
      [tournamentData, status] = await Promise.all([
        api.get(`/tournaments/${id}`),
        api.get(`/tournaments/${id}/system/status`),
      ]);
    } catch (err) {
      reportError(err);
      return;
    }
    paint();
  };

  function paint() {
    clear(main);

    const headerActions = [];
    if (can('write')) {
      headerActions.push(el('button', {
        class: 'btn',
        onclick: () => openModal({ title: 'تعديل بيانات البطولة', content: tournamentForm(tournamentData.item, rerender) }),
      }, 'تعديل البيانات'));
    }

    main.appendChild(el('button', { class: 'link-btn', style: 'margin-bottom:10px;', onclick: () => navigate('/tournaments') }, '→ العودة إلى البطولات'));

    main.appendChild(pageHeader(
      tournament.name,
      `${tournament.category} · نسخة ${tournament.year}`,
      [el('span', { class: `badge ${tournament.status === 'ongoing' ? 'badge-gold' : 'badge-muted'}` }, TOURNAMENT_STATUS_LABELS[tournament.status] || tournament.status), ...headerActions]
    ));

    main.appendChild(el('div', { class: 'grid grid-cols-3', style: 'margin-bottom:20px;' }, [
      el('div', { class: 'stat-card' }, [
        el('div', { class: 'body' }, [el('div', { class: 'label' }, 'الفترة'), el('div', { style: 'font-weight:700;font-size:14px;' }, `${formatDate(tournament.start_date)} → ${formatDate(tournament.end_date)}`)]),
        el('div', { class: 'icon' }, '📅'),
      ]),
      el('div', { class: 'stat-card' }, [
        el('div', { class: 'body' }, [el('div', { class: 'label' }, 'الدولة المضيفة'), el('div', { style: 'font-weight:700;font-size:14px;' }, `${tournament.host_country}${tournament.host_city ? ' - ' + tournament.host_city : ''}`)]),
        el('div', { class: 'icon' }, '📍'),
      ]),
      el('div', { class: 'stat-card' }, [
        el('div', { class: 'body' }, [el('div', { class: 'label' }, 'الفئة'), el('div', { style: 'font-weight:700;font-size:14px;' }, tournament.category)]),
        el('div', { class: 'icon' }, '🏆'),
      ]),
    ]));

    const tabs = [
      { key: 'matches', label: 'المباريات' },
      { key: 'groups', label: 'المجموعات' },
      { key: 'scorers', label: 'الهدافون' },
      { key: 'standings', label: 'جدول الترتيب' },
    ];
    main.appendChild(el('div', { class: 'tabs' }, tabs.map((t) => el('button', {
      class: t.key === activeTab ? 'active' : '',
      onclick: () => { activeTab = t.key; paint(); },
    }, t.label))));

    const tabContent = el('div', { id: 'tab-content' });
    main.appendChild(tabContent);
    renderTabContent(tabContent);

    main.appendChild(renderSystemPanel());
  }

  function renderTabContent(container) {
    if (activeTab === 'matches') renderMatchesTab(container);
    else if (activeTab === 'groups') renderGroupsTab(container);
    else if (activeTab === 'scorers') renderScorersTab(container);
    else if (activeTab === 'standings') renderStandingsTab(container);
  }

  async function renderMatchesTab(container) {
    container.appendChild(loadingRow());
    try {
      const { items } = await api.get(`/matches?tournament_id=${id}&limit=100`);
      clear(container);
      if (items.length === 0) {
        container.appendChild(emptyState('لا توجد مباريات بعد', 'استخدم لوحة نظام البطولة أدناه لتوليد المباريات', '📅'));
        return;
      }
      const card = el('div', { class: 'card' });
      const table = el('table', {}, [
        el('thead', {}, el('tr', {}, ['التاريخ', 'الدور', 'المضيف', 'النتيجة', 'الضيف', 'الحالة', 'إجراءات'].map((h) => el('th', {}, h)))),
      ]);
      const tbody = el('tbody');
      for (const m of items) {
        tbody.appendChild(el('tr', {}, [
          el('td', {}, formatDateTime(m.match_date)),
          el('td', {}, el('span', { class: 'badge badge-muted' }, STAGE_LABELS[m.stage] || m.stage)),
          el('td', { style: 'font-weight:600;' }, m.home_team_name),
          el('td', {}, el('span', { class: `score-pill ${m.status === 'finished' ? '' : 'muted'}` }, m.status === 'finished' ? `${m.home_score} - ${m.away_score}` : '–')),
          el('td', { style: 'font-weight:600;' }, m.away_team_name),
          el('td', {}, el('span', { class: `badge ${m.status === 'finished' ? (m.approved ? '' : 'badge-gold') : 'badge-muted'}` },
            m.status === 'finished' ? (m.approved ? 'معتمدة' : 'بانتظار الاعتماد') : 'مجدولة')),
          el('td', {}, matchRowActions(m, rerenderMatchesTab)),
        ]));
      }
      table.appendChild(tbody);
      const tableWrap = el('div', { class: 'table-wrap' }, table);
      card.appendChild(tableWrap);
      container.appendChild(card);

      async function rerenderMatchesTab() {
        clear(container);
        await renderMatchesTab(container);
        await refreshStatus();
      }
    } catch (err) {
      clear(container);
      reportError(err);
    }
  }

  async function refreshStatus() {
    try { status = await api.get(`/tournaments/${id}/system/status`); } catch (_) { /* ignore */ }
    const panelHolder = document.getElementById('system-panel-holder');
    if (panelHolder) {
      clear(panelHolder);
      panelHolder.appendChild(renderSystemPanel(true));
    }
  }

  function matchRowActions(m, onChanged) {
    const wrap = el('div', { style: 'display:flex;gap:4px;' });
    if (can('write')) {
      wrap.appendChild(el('button', {
        class: 'icon-btn', title: 'إدخال النتيجة',
        onclick: () => openModal({ title: `نتيجة المباراة: ${m.home_team_name} × ${m.away_team_name}`, content: matchResultForm(m, onChanged) }),
      }, '✏️'));
      wrap.appendChild(el('button', {
        class: 'icon-btn', title: 'أحداث المباراة',
        onclick: () => openModal({ title: 'أحداث المباراة (الأهداف)', content: matchEventsPanel(m), width: '520px' }),
      }, '⚽'));
    }
    if (can('approve') && m.status === 'finished') {
      wrap.appendChild(el('button', {
        class: 'icon-btn', title: m.approved ? 'إلغاء الاعتماد' : 'اعتماد النتيجة',
        onclick: async () => {
          try {
            await api.post(`/matches/${m.id}/approve`, { approved: !m.approved });
            toast(m.approved ? 'أُلغي اعتماد النتيجة' : 'تم اعتماد النتيجة', 'success');
            onChanged();
          } catch (err) { reportError(err); }
        },
      }, m.approved ? '↩️' : '✅'));
    }
    if (can('delete')) {
      wrap.appendChild(el('button', {
        class: 'icon-btn danger', title: 'حذف',
        onclick: () => confirmDialog({
          title: 'حذف المباراة',
          message: `سيتم حذف مباراة ${m.home_team_name} × ${m.away_team_name} نهائيًا.`,
          onConfirm: async () => {
            try { await api.del(`/matches/${m.id}`); toast('تم حذف المباراة', 'success'); onChanged(); }
            catch (err) { reportError(err); }
          },
        }),
      }, '🗑️'));
    }
    return wrap;
  }

  function renderGroupsTab(container) {
    const groups = tournamentData.groups || [];
    container.appendChild(el('div', { class: 'grid grid-cols-2' }, groups.map((g) => groupCard(g))));
    if (can('write') && groups.length < 2) {
      container.appendChild(el('button', {
        class: 'btn btn-primary', style: 'margin-top:14px;',
        onclick: () => openModal({ title: 'مجموعة جديدة', content: groupForm(null, rerender) }),
      }, '+ مجموعة جديدة'));
    }
  }

  function groupCard(g) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'flex-between', style: 'margin-bottom:10px;' }, [
      el('h3', { style: 'margin:0;' }, g.name),
      el('span', { class: `badge ${g.approved ? '' : 'badge-gold'}` }, g.approved ? 'معتمدة' : 'بانتظار الاعتماد'),
    ]));
    const list = el('ul', { style: 'list-style:none;padding:0;margin:0 0 14px;' }, (g.teams || []).map((t) => el('li', {
      style: 'padding:8px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;',
    }, [el('span', {}, t.team_flag || ''), el('span', { style: 'font-weight:600;' }, t.team_name), el('span', { class: 'text-muted' }, t.team_code)])));
    card.appendChild(list);
    const actions = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
    if (can('write')) {
      actions.appendChild(el('button', { class: 'btn btn-sm', onclick: () => openModal({ title: `تعديل ${g.name}`, content: groupForm(g, rerender) }) }, 'تعديل الفرق'));
    }
    if (can('generate')) {
      actions.appendChild(el('button', {
        class: `btn btn-sm ${g.approved ? '' : 'btn-primary'}`,
        onclick: async () => {
          try {
            await api.post(`/tournaments/${id}/groups/${g.id}/approve`, { approved: !g.approved });
            toast(g.approved ? 'أُلغي اعتماد المجموعة' : 'تم اعتماد المجموعة', 'success');
            rerender();
          } catch (err) { reportError(err); }
        },
      }, g.approved ? 'إلغاء الاعتماد' : 'اعتماد المجموعة'));
    }
    if (can('write')) {
      actions.appendChild(el('button', {
        class: 'btn btn-sm btn-danger',
        onclick: () => confirmDialog({
          title: 'حذف المجموعة', message: `سيتم حذف ${g.name} نهائيًا.`,
          onConfirm: async () => {
            try { await api.del(`/tournaments/${id}/groups/${g.id}`); toast('تم حذف المجموعة', 'success'); rerender(); }
            catch (err) { reportError(err); }
          },
        }),
      }, 'حذف'));
    }
    card.appendChild(actions);
    return card;
  }

  function groupForm(existing, onSaved) {
    const nameInput = el('input', { type: 'text', value: existing?.name || '', placeholder: 'مثال: المجموعة أ' });
    const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:0 0 10px;' });
    const teamCheckboxes = { current: [] };
    const teamListEl = el('div', { style: 'max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;' }, loadingRow());

    api.get('/teams').then(({ items }) => {
      clear(teamListEl);
      const selectedIds = new Set((existing?.teams || []).map((t) => t.team_id));
      teamCheckboxes.current = items.map((team) => {
        const cb = el('input', { type: 'checkbox', value: team.id, checked: selectedIds.has(team.id) });
        teamListEl.appendChild(el('label', { style: 'display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;' }, [cb, `${team.flag || ''} ${team.name}`]));
        return cb;
      });
    }).catch((err) => { clear(teamListEl); teamListEl.appendChild(el('p', {}, 'تعذر تحميل المنتخبات')); reportError(err); });

    const submit = async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      const name = nameInput.value.trim();
      if (!name) { errorBox.textContent = 'اسم المجموعة مطلوب'; return; }
      const team_ids = teamCheckboxes.current.filter((cb) => cb.checked).map((cb) => Number(cb.value));
      try {
        if (existing) await api.put(`/tournaments/${id}/groups/${existing.id}`, { name, team_ids });
        else await api.post(`/tournaments/${id}/groups`, { name, team_ids });
        toast('تم حفظ المجموعة', 'success');
        closeModal();
        onSaved();
      } catch (err) { errorBox.textContent = err.message; }
    };

    return el('form', { onsubmit: submit }, [
      errorBox,
      el('div', { class: 'field' }, [el('label', {}, 'اسم المجموعة'), nameInput]),
      el('div', { class: 'field' }, [el('label', {}, 'الفرق المشاركة'), teamListEl]),
      el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn', onclick: closeModal }, 'إلغاء'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'حفظ'),
      ]),
    ]);
  }

  async function renderScorersTab(container) {
    container.appendChild(loadingRow());
    try {
      const { items } = await api.get(`/stats/scorers?tournament_id=${id}`);
      clear(container);
      if (items.length === 0) {
        container.appendChild(emptyState('لا توجد بيانات هدافين بعد', 'تُحتسب الأهداف بعد اعتماد نتائج المباريات', '⚽'));
        return;
      }
      const card = el('div', { class: 'card' });
      const table = el('table', {}, [
        el('thead', {}, el('tr', {}, ['#', 'اللاعب', 'المنتخب', 'الأهداف'].map((h) => el('th', {}, h)))),
        el('tbody', {}, items.map((p, i) => el('tr', {}, [
          el('td', {}, String(i + 1)),
          el('td', { style: 'font-weight:600;' }, p.player_name),
          el('td', {}, `${p.team_code} · ${p.team_name}`),
          el('td', {}, el('span', { class: 'badge badge-gold' }, p.goals)),
        ]))),
      ]);
      card.appendChild(el('div', { class: 'table-wrap' }, table));
      container.appendChild(card);
    } catch (err) { clear(container); reportError(err); }
  }

  async function renderStandingsTab(container) {
    container.appendChild(loadingRow());
    try {
      const { items } = await api.get(`/tournaments/${id}/standings`);
      clear(container);
      if (items.length === 0) {
        container.appendChild(emptyState('لا توجد مجموعات بعد', null, '📋'));
        return;
      }
      for (const { group, standings } of items) {
        const block = el('div', { class: 'group-block' });
        block.appendChild(el('h4', {}, group.name));
        const card = el('div', { class: 'card' });
        const table = el('table', {}, [
          el('thead', {}, el('tr', {}, ['#', 'المنتخب', 'لعب', 'فاز', 'تعادل', 'خسر', 'له', 'عليه', '+/-', 'نقاط'].map((h) => el('th', {}, h)))),
          el('tbody', {}, standings.map((s, i) => el('tr', {}, [
            el('td', {}, String(i + 1)),
            el('td', { style: 'font-weight:600;display:flex;align-items:center;gap:6px;' }, [s.flag || '', ` ${s.name}`]),
            el('td', {}, String(s.played)),
            el('td', {}, String(s.won)),
            el('td', {}, String(s.drawn)),
            el('td', { style: 'color:var(--danger);' }, String(s.lost)),
            el('td', {}, String(s.goals_for)),
            el('td', {}, String(s.goals_against)),
            el('td', {}, String(s.goal_diff)),
            el('td', { style: 'font-weight:700;' }, String(s.points)),
          ]))),
        ]);
        card.appendChild(el('div', { class: 'table-wrap' }, table));
        block.appendChild(card);
        container.appendChild(block);
      }
    } catch (err) { clear(container); reportError(err); }
  }

  function renderSystemPanel(skipWrapper) {
    const panel = el('div', { class: 'card system-panel' }, [
      el('h3', {}, 'لوحة نظام البطولة'),
      ...STAGE_PANEL_DEFS.map((def, idx) => {
        const done = def.key === 'groupStage' ? status.groupStageGenerated
          : def.key === 'knockouts' ? status.hasSemifinals
          : status.hasFinal;
        const canDo = status[def.canKey];
        const reasonKey = def.key === 'groupStage' ? 'groupStage' : def.key === 'knockouts' ? 'knockouts' : 'finals';
        const reason = status.reasons[reasonKey];
        return el('div', { class: 'stage-row' }, [
          el('div', { class: 'stage-info' }, [
            el('div', { class: `stage-index ${done ? 'done' : ''}` }, done ? '✓' : String(idx + 1)),
            el('div', {}, [
              el('div', { class: 'stage-title' }, def.title),
              reason ? el('div', { class: 'stage-reason' }, reason) : (done ? el('div', { class: 'stage-reason' }, 'تم التنفيذ بنجاح') : null),
            ]),
          ]),
          el('button', {
            class: 'btn btn-primary btn-sm',
            disabled: done || !canDo || !can('generate'),
            onclick: async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              btn.textContent = 'جاري التوليد...';
              try {
                const result = await api.post(`/tournaments/${id}/system/${def.endpoint}`);
                toast(`تم توليد ${def.title} (${result.createdMatches} مباراة)`, 'success');
                await rerender();
              } catch (err) {
                reportError(err);
                btn.disabled = done || !canDo;
                btn.textContent = 'توليد';
              }
            },
          }, done ? 'تم التوليد' : 'توليد'),
        ]);
      }),
    ]);
    if (!skipWrapper) {
      const holder = el('div', { id: 'system-panel-holder' }, panel);
      return holder;
    }
    return panel;
  }

  paint();
}
