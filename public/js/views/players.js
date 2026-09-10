import { el, clear, loadingRow, emptyState, CATEGORIES, POSITIONS } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { can } from '../state.js';

async function playerForm(existing, onSaved) {
  const { items: teams } = await api.get('/teams');
  const isEdit = !!existing;
  const fields = {
    name: el('input', { type: 'text', value: existing?.name || '' }),
    number: el('input', { type: 'number', min: 1, max: 99, value: existing?.number || '' }),
    position: el('select', {}, POSITIONS.map((p) => el('option', { value: p, selected: existing?.position === p }, p))),
    team_id: el('select', {}, teams.map((t) => el('option', { value: t.id, selected: String(existing?.team_id) === String(t.id) }, `${t.flag || ''} ${t.name}`))),
    category: el('select', {}, CATEGORIES.map((c) => el('option', { value: c, selected: existing?.category === c }, c))),
  };
  const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:0 0 10px;' });

  const submit = async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    const payload = {
      name: fields.name.value.trim(),
      number: Number(fields.number.value),
      position: fields.position.value,
      team_id: Number(fields.team_id.value),
      category: fields.category.value,
    };
    if (!payload.name || !payload.number || !payload.team_id) {
      errorBox.textContent = 'الاسم والرقم والمنتخب مطلوبة';
      return;
    }
    try {
      if (isEdit) await api.put(`/players/${existing.id}`, payload);
      else await api.post('/players', payload);
      toast(isEdit ? 'تم تحديث بيانات اللاعب' : 'تم إضافة اللاعب', 'success');
      closeModal();
      onSaved();
    } catch (err) { errorBox.textContent = err.message; }
  };

  return el('form', { onsubmit: submit }, [
    errorBox,
    el('div', { class: 'field' }, [el('label', {}, 'اسم اللاعب'), fields.name]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'الرقم'), fields.number]),
      el('div', { class: 'field' }, [el('label', {}, 'المركز'), fields.position]),
    ]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'المنتخب'), fields.team_id]),
      el('div', { class: 'field' }, [el('label', {}, 'الفئة'), fields.category]),
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: closeModal }, 'إلغاء'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'حفظ التعديلات' : 'إضافة اللاعب'),
    ]),
  ]);
}

export async function renderPlayers() {
  const main = getMain();
  clear(main);

  let filters = { team_id: '', category: '', q: '' };
  let page = 1;
  let teamsCache = [];

  try { teamsCache = (await api.get('/teams')).items; } catch (_) { /* ignore */ }

  const load = async () => {
    const listWrap = main.querySelector('#players-list');
    clear(listWrap);
    listWrap.appendChild(loadingRow());
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (filters.team_id) params.set('team_id', filters.team_id);
      if (filters.category) params.set('category', filters.category);
      if (filters.q) params.set('q', filters.q);
      const data = await api.get(`/players?${params}`);
      clear(listWrap);
      if (data.items.length === 0) {
        listWrap.appendChild(emptyState('لا يوجد لاعبون مطابقون', 'جرّب تعديل معايير البحث أو أضف لاعبًا جديدًا', '👥'));
        return;
      }
      const card = el('div', { class: 'card' });
      const table = el('table', {}, [
        el('thead', {}, el('tr', {}, ['الرقم', 'اللاعب', 'المنتخب', 'المركز', 'الفئة', 'إجراءات'].map((h) => el('th', {}, h)))),
        el('tbody', {}, data.items.map((p) => el('tr', {}, [
          el('td', { class: 'mono', style: 'font-weight:700;' }, String(p.number)),
          el('td', { style: 'font-weight:600;' }, p.name),
          el('td', {}, `${p.team_code} · ${p.team_name}`),
          el('td', {}, p.position),
          el('td', {}, p.category),
          el('td', {}, rowActions(p)),
        ]))),
      ]);
      card.appendChild(el('div', { class: 'table-wrap' }, table));
      card.appendChild(el('div', { class: 'pagination' }, [
        el('button', { class: 'btn btn-sm', disabled: page <= 1, onclick: () => { page -= 1; load(); } }, 'السابق'),
        el('span', {}, `صفحة ${data.page} من ${data.totalPages} (${data.total} لاعب)`),
        el('button', { class: 'btn btn-sm', disabled: page >= data.totalPages, onclick: () => { page += 1; load(); } }, 'التالي'),
      ]));
      clear(listWrap);
      listWrap.appendChild(card);
    } catch (err) { clear(listWrap); reportError(err); }
  };

  function rowActions(p) {
    const wrap = el('div', { style: 'display:flex;gap:4px;' });
    if (can('write')) {
      wrap.appendChild(el('button', {
        class: 'icon-btn', title: 'تعديل',
        onclick: async () => openModal({ title: 'تعديل بيانات اللاعب', content: await playerForm(p, load) }),
      }, '✏️'));
      wrap.appendChild(el('button', {
        class: 'icon-btn danger', title: 'حذف',
        onclick: () => confirmDialog({
          title: 'حذف اللاعب', message: `سيتم حذف ${p.name} نهائيًا.`,
          onConfirm: async () => {
            try { await api.del(`/players/${p.id}`); toast('تم حذف اللاعب', 'success'); load(); }
            catch (err) { reportError(err); }
          },
        }),
      }, '🗑️'));
    }
    return wrap;
  }

  const searchInput = el('input', { type: 'text', placeholder: 'بحث بالاسم أو المنتخب...' });
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.q = searchInput.value.trim(); page = 1; load(); }, 300);
  });
  const teamSelect = el('select', { onchange: (e) => { filters.team_id = e.target.value; page = 1; load(); } },
    [el('option', { value: '' }, 'جميع المنتخبات'), ...teamsCache.map((t) => el('option', { value: t.id }, t.name))]);
  const categorySelect = el('select', { onchange: (e) => { filters.category = e.target.value; page = 1; load(); } },
    [el('option', { value: '' }, 'جميع الفئات'), ...CATEGORIES.map((c) => el('option', { value: c }, c))]);

  const actions = [];
  if (can('write')) {
    actions.push(el('button', {
      class: 'btn btn-primary',
      onclick: async () => openModal({ title: 'لاعب جديد', content: await playerForm(null, load) }),
    }, ['+ ', 'لاعب جديد']));
  }

  main.appendChild(pageHeader('اللاعبون', 'قائمة لاعبين قابلة للبحث', actions));
  main.appendChild(el('div', { class: 'toolbar' }, [searchInput, teamSelect, categorySelect]));
  main.appendChild(el('div', { id: 'players-list' }));

  load();
}
