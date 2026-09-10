import { el, clear, loadingRow, emptyState, formatDateTime, toDateTimeLocalValue, CATEGORIES } from '../helpers.js';
import { STAGE_LABELS, MATCH_STATUS_LABELS } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { can } from '../state.js';

export function matchResultForm(match, onSaved) {
  const homeScore = el('input', { type: 'number', min: 0, value: match.home_score ?? '' });
  const awayScore = el('input', { type: 'number', min: 0, value: match.away_score ?? '' });
  const homePen = el('input', { type: 'number', min: 0, value: match.home_penalties ?? '' });
  const awayPen = el('input', { type: 'number', min: 0, value: match.away_penalties ?? '' });
  const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:8px 0 0;line-height:1.7;' });
  const showPenalties = match.stage !== 'group';

  const submit = async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    if (homeScore.value === '' || awayScore.value === '') {
      errorBox.textContent = 'الرجاء إدخال نتيجة المباراة كاملة';
      return;
    }
    const payload = {
      home_score: Number(homeScore.value),
      away_score: Number(awayScore.value),
      status: 'finished',
    };
    if (showPenalties && homePen.value !== '' && awayPen.value !== '') {
      payload.home_penalties = Number(homePen.value);
      payload.away_penalties = Number(awayPen.value);
    }
    try {
      await api.put(`/matches/${match.id}/result`, payload);
      toast('تم حفظ نتيجة المباراة', 'success');
      closeModal();
      onSaved();
    } catch (err) {
      errorBox.textContent = err.message;
    }
  };

  const revertBtn = el('button', {
    type: 'button', class: 'btn btn-sm',
    onclick: async () => {
      try {
        await api.put(`/matches/${match.id}/result`, { status: 'scheduled' });
        toast('تمت إعادة المباراة إلى حالة مجدولة', 'success');
        closeModal();
        onSaved();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, 'إعادة تعيين إلى مجدولة');

  return el('form', { onsubmit: submit }, [
    el('p', { class: 'text-muted', style: 'margin:0 0 14px;font-size:13px;' }, `${match.home_team_name} × ${match.away_team_name} — ${STAGE_LABELS[match.stage] || match.stage}`),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, `أهداف ${match.home_team_name}`), homeScore]),
      el('div', { class: 'field' }, [el('label', {}, `أهداف ${match.away_team_name}`), awayScore]),
    ]),
    showPenalties ? el('div', {}, [
      el('p', { class: 'text-muted', style: 'font-size:12px;margin:0 0 8px;' }, 'ركلات الترجيح (تُستخدم فقط عند التعادل في مباراة إقصائية، ولا يقبل النظام تعادلًا نهائيًا هنا)'),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', {}, 'ركلات ' + match.home_team_name), homePen]),
        el('div', { class: 'field' }, [el('label', {}, 'ركلات ' + match.away_team_name), awayPen]),
      ]),
    ]) : null,
    errorBox,
    el('div', { class: 'modal-actions', style: 'justify-content:space-between;' }, [
      match.status === 'finished' ? revertBtn : el('span'),
      el('div', { style: 'display:flex;gap:10px;' }, [
        el('button', { type: 'button', class: 'btn', onclick: closeModal }, 'إلغاء'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'حفظ النتيجة'),
      ]),
    ]),
  ]);
}

export function matchEventsPanel(match) {
  const container = el('div', {}, loadingRow());

  async function refresh() {
    clear(container);
    container.appendChild(loadingRow());
    try {
      const detail = await api.get(`/matches/${match.id}`);
      clear(container);
      const eventsList = el('div', { style: 'margin-bottom:16px;' });
      if (detail.events.length === 0) {
        eventsList.appendChild(el('p', { class: 'text-muted', style: 'font-size:13px;' }, 'لا توجد أهداف مسجلة بعد'));
      } else {
        for (const ev of detail.events) {
          eventsList.appendChild(el('div', {
            style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--border);',
          }, [
            el('span', {}, `⚽ ${ev.minute}' — ${ev.player_name} (${ev.team_name})`),
            can('write') ? el('button', {
              class: 'icon-btn danger', title: 'حذف',
              onclick: async () => {
                try { await api.del(`/matches/${match.id}/events/${ev.id}`); refresh(); } catch (err) { reportError(err); }
              },
            }, '🗑️') : null,
          ]));
        }
      }
      container.appendChild(eventsList);

      if (can('write')) {
        const teamSelect = el('select', {}, [
          el('option', { value: match.home_team_id }, match.home_team_name),
          el('option', { value: match.away_team_id }, match.away_team_name),
        ]);
        const playerSelect = el('select', {}, loadingRow());
        const minuteInput = el('input', { type: 'number', min: 1, max: 130, value: '1', style: 'width:80px;' });
        const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:8px 0 0;' });

        async function loadPlayers() {
          clear(playerSelect);
          const { items } = await api.get(`/players?team_id=${teamSelect.value}&limit=100`);
          items.forEach((p) => playerSelect.appendChild(el('option', { value: p.id }, `${p.number} - ${p.name}`)));
        }
        teamSelect.addEventListener('change', loadPlayers);
        await loadPlayers();

        const addForm = el('form', {
          style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:14px;',
          onsubmit: async (e) => {
            e.preventDefault();
            errorBox.textContent = '';
            try {
              await api.post(`/matches/${match.id}/events`, {
                team_id: Number(teamSelect.value), player_id: Number(playerSelect.value), minute: Number(minuteInput.value),
              });
              toast('تمت إضافة الهدف', 'success');
              refresh();
            } catch (err) { errorBox.textContent = err.message; }
          },
        }, [
          el('div', { class: 'field', style: 'margin:0;flex:1;min-width:140px;' }, [el('label', {}, 'المنتخب'), teamSelect]),
          el('div', { class: 'field', style: 'margin:0;flex:1;min-width:140px;' }, [el('label', {}, 'اللاعب'), playerSelect]),
          el('div', { class: 'field', style: 'margin:0;' }, [el('label', {}, 'الدقيقة'), minuteInput]),
          el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, '+ إضافة هدف'),
        ]);
        container.appendChild(addForm);
        container.appendChild(errorBox);
      }
    } catch (err) { clear(container); reportError(err); }
  }

  refresh();
  return container;
}

async function matchCreateForm(onSaved) {
  const [{ items: tournaments }, { items: teams }] = await Promise.all([api.get('/tournaments'), api.get('/teams')]);
  const tournamentSelect = el('select', {}, tournaments.map((t) => el('option', { value: t.id }, t.name)));
  const stageSelect = el('select', {}, Object.entries(STAGE_LABELS).map(([v, l]) => el('option', { value: v }, l)));
  const homeSelect = el('select', {}, teams.map((t) => el('option', { value: t.id }, t.name)));
  const awaySelect = el('select', {}, teams.map((t) => el('option', { value: t.id, selected: t.id === teams[1]?.id }, t.name)));
  const dateInput = el('input', { type: 'datetime-local', value: toDateTimeLocalValue(new Date().toISOString()) });
  const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:0 0 10px;' });

  const submit = async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    if (homeSelect.value === awaySelect.value) { errorBox.textContent = 'لا يجوز أن يواجه الفريق نفسه'; return; }
    try {
      await api.post('/matches', {
        tournament_id: Number(tournamentSelect.value),
        stage: stageSelect.value,
        home_team_id: Number(homeSelect.value),
        away_team_id: Number(awaySelect.value),
        match_date: new Date(dateInput.value).toISOString(),
      });
      toast('تم إنشاء المباراة', 'success');
      closeModal();
      onSaved();
    } catch (err) { errorBox.textContent = err.message; }
  };

  return el('form', { onsubmit: submit }, [
    errorBox,
    el('div', { class: 'field' }, [el('label', {}, 'البطولة'), tournamentSelect]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'الفريق المضيف'), homeSelect]),
      el('div', { class: 'field' }, [el('label', {}, 'الفريق الضيف'), awaySelect]),
    ]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'الدور'), stageSelect]),
      el('div', { class: 'field' }, [el('label', {}, 'الموعد'), dateInput]),
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: closeModal }, 'إلغاء'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'إنشاء المباراة'),
    ]),
  ]);
}

export async function renderMatches() {
  const main = getMain();
  clear(main);

  let filters = { tournament_id: '', team_id: '', status: '', category: '' };
  let page = 1;
  let tournamentsCache = [];
  try { tournamentsCache = (await api.get('/tournaments')).items; } catch (_) { /* ignore */ }

  const load = async () => {
    const listWrap = main.querySelector('#matches-list');
    clear(listWrap);
    listWrap.appendChild(loadingRow());
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const data = await api.get(`/matches?${params}`);
      clear(listWrap);
      if (data.items.length === 0) {
        listWrap.appendChild(emptyState('لا توجد مباريات مطابقة', null, '📅'));
        return;
      }
      const card = el('div', { class: 'card' });
      const table = el('table', {}, [
        el('thead', {}, el('tr', {}, ['التاريخ', 'البطولة', 'المضيف', 'النتيجة', 'الضيف', 'الدور', 'الحالة', 'إجراءات'].map((h) => el('th', {}, h)))),
        el('tbody', {}, data.items.map((m) => el('tr', {}, [
          el('td', {}, formatDateTime(m.match_date)),
          el('td', {}, m.tournament_name),
          el('td', { style: 'font-weight:600;' }, m.home_team_name),
          el('td', {}, el('span', { class: `score-pill ${m.status === 'finished' ? '' : 'muted'}` }, m.status === 'finished' ? `${m.home_score} - ${m.away_score}` : '–')),
          el('td', { style: 'font-weight:600;' }, m.away_team_name),
          el('td', {}, el('span', { class: 'badge badge-muted' }, STAGE_LABELS[m.stage] || m.stage)),
          el('td', {}, el('span', { class: `badge ${m.status === 'finished' ? (m.approved ? '' : 'badge-gold') : 'badge-muted'}` },
            m.status === 'finished' ? (m.approved ? 'معتمدة' : 'بانتظار الاعتماد') : 'مجدولة')),
          el('td', {}, rowActions(m)),
        ]))),
      ]);
      card.appendChild(el('div', { class: 'table-wrap' }, table));
      card.appendChild(el('div', { class: 'pagination' }, [
        el('button', { class: 'btn btn-sm', disabled: page <= 1, onclick: () => { page -= 1; load(); } }, 'السابق'),
        el('span', {}, `صفحة ${data.page} من ${data.totalPages} (${data.total} مباراة)`),
        el('button', { class: 'btn btn-sm', disabled: page >= data.totalPages, onclick: () => { page += 1; load(); } }, 'التالي'),
      ]));
      clear(listWrap);
      listWrap.appendChild(card);
    } catch (err) { clear(listWrap); reportError(err); }
  };

  function rowActions(m) {
    const wrap = el('div', { style: 'display:flex;gap:4px;' });
    if (can('write')) {
      wrap.appendChild(el('button', { class: 'icon-btn', title: 'إدخال النتيجة', onclick: () => openModal({ title: 'نتيجة المباراة', content: matchResultForm(m, load) }) }, '✏️'));
      wrap.appendChild(el('button', { class: 'icon-btn', title: 'أحداث المباراة', onclick: () => openModal({ title: 'أحداث المباراة', content: matchEventsPanel(m), width: '520px' }) }, '⚽'));
    }
    if (can('approve') && m.status === 'finished') {
      wrap.appendChild(el('button', {
        class: 'icon-btn', title: m.approved ? 'إلغاء الاعتماد' : 'اعتماد',
        onclick: async () => {
          try { await api.post(`/matches/${m.id}/approve`, { approved: !m.approved }); toast('تم التحديث', 'success'); load(); }
          catch (err) { reportError(err); }
        },
      }, m.approved ? '↩️' : '✅'));
    }
    if (can('delete')) {
      wrap.appendChild(el('button', {
        class: 'icon-btn danger', title: 'حذف',
        onclick: () => confirmDialog({
          title: 'حذف المباراة', message: `سيتم حذف مباراة ${m.home_team_name} × ${m.away_team_name} نهائيًا.`,
          onConfirm: async () => { try { await api.del(`/matches/${m.id}`); toast('تم الحذف', 'success'); load(); } catch (err) { reportError(err); } },
        }),
      }, '🗑️'));
    }
    return wrap;
  }

  const statusSelect = el('select', { onchange: (e) => { filters.status = e.target.value; page = 1; load(); } },
    [el('option', { value: '' }, 'جميع الحالات'), ...Object.entries(MATCH_STATUS_LABELS).map(([v, l]) => el('option', { value: v }, l))]);
  const tournamentSelect = el('select', { onchange: (e) => { filters.tournament_id = e.target.value; page = 1; load(); } },
    [el('option', { value: '' }, 'جميع البطولات'), ...tournamentsCache.map((t) => el('option', { value: t.id }, t.name))]);
  const categorySelect = el('select', { onchange: (e) => { filters.category = e.target.value; page = 1; load(); } },
    [el('option', { value: '' }, 'جميع الفئات'), ...CATEGORIES.map((c) => el('option', { value: c }, c))]);

  const actions = [];
  if (can('write')) {
    actions.push(el('button', { class: 'btn btn-primary', onclick: async () => openModal({ title: 'مباراة جديدة', content: await matchCreateForm(load) }) }, ['+ ', 'مباراة جديدة']));
  }

  main.appendChild(pageHeader('المباريات', 'جدول ونتائج موحدان', actions));
  main.appendChild(el('div', { class: 'toolbar' }, [statusSelect, tournamentSelect, categorySelect]));
  main.appendChild(el('div', { id: 'matches-list' }));

  load();
}
