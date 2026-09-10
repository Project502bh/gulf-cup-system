import { el, clear, loadingRow, emptyState, CATEGORIES } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { can } from '../state.js';

function teamForm(existing, onSaved) {
  const isEdit = !!existing;
  const fields = {
    name: el('input', { type: 'text', value: existing?.name || '', placeholder: 'مثال: المنتخب السعودي' }),
    country: el('input', { type: 'text', value: existing?.country || '' }),
    code: el('input', { type: 'text', value: existing?.code || '', maxlength: 3, placeholder: 'SA' }),
    coach: el('input', { type: 'text', value: existing?.coach || '' }),
    category: el('select', {}, CATEGORIES.map((c) => el('option', { value: c, selected: existing?.category === c }, c))),
    flag: el('input', { type: 'text', value: existing?.flag || '', placeholder: '🇸🇦 (إيموجي العلم)' }),
  };
  const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:0 0 10px;' });

  const submit = async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    const payload = {
      name: fields.name.value.trim(),
      country: fields.country.value.trim(),
      code: fields.code.value.trim(),
      coach: fields.coach.value.trim(),
      category: fields.category.value,
      flag: fields.flag.value.trim(),
    };
    if (!payload.name || !payload.country || !payload.code) {
      errorBox.textContent = 'اسم المنتخب والدولة والرمز مطلوبة';
      return;
    }
    try {
      if (isEdit) await api.put(`/teams/${existing.id}`, payload);
      else await api.post('/teams', payload);
      toast(isEdit ? 'تم تحديث المنتخب' : 'تم إضافة المنتخب', 'success');
      closeModal();
      onSaved();
    } catch (err) { errorBox.textContent = err.message; }
  };

  return el('form', { onsubmit: submit }, [
    errorBox,
    el('div', { class: 'field' }, [el('label', {}, 'اسم المنتخب'), fields.name]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'الدولة'), fields.country]),
      el('div', { class: 'field' }, [el('label', {}, 'الرمز'), fields.code]),
    ]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'المدرب'), fields.coach]),
      el('div', { class: 'field' }, [el('label', {}, 'الفئة'), fields.category]),
    ]),
    el('div', { class: 'field' }, [el('label', {}, 'العلم'), fields.flag]),
    el('div', { class: 'modal-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: closeModal }, 'إلغاء'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'حفظ التعديلات' : 'إضافة المنتخب'),
    ]),
  ]);
}

export async function renderTeams() {
  const main = getMain();
  clear(main);

  let categoryFilter = '';
  let query = '';

  const load = async () => {
    const listWrap = main.querySelector('#teams-list');
    clear(listWrap);
    listWrap.appendChild(loadingRow());
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (query) params.set('q', query);
      const { items } = await api.get(`/teams?${params}`);
      clear(listWrap);
      if (items.length === 0) {
        listWrap.appendChild(emptyState('لا توجد منتخبات بعد', 'أضف منتخبًا جديدًا للبدء', '🛡️'));
        return;
      }
      const card = el('div', { class: 'card' });
      const table = el('table', {}, [
        el('thead', {}, el('tr', {}, ['العلم', 'المنتخب', 'الرمز', 'الدولة', 'المدرب', 'الفئة', 'إجراءات'].map((h) => el('th', {}, h)))),
        el('tbody', {}, items.map((t) => el('tr', {}, [
          el('td', { style: 'font-size:20px;' }, t.flag || '—'),
          el('td', { style: 'font-weight:600;' }, t.name),
          el('td', {}, el('span', { class: 'badge' }, t.code)),
          el('td', {}, t.country),
          el('td', {}, t.coach || '—'),
          el('td', {}, t.category),
          el('td', {}, rowActions(t)),
        ]))),
      ]);
      card.appendChild(el('div', { class: 'table-wrap' }, table));
      clear(listWrap);
      listWrap.appendChild(card);
    } catch (err) { clear(listWrap); reportError(err); }
  };

  function rowActions(t) {
    const wrap = el('div', { style: 'display:flex;gap:4px;' });
    if (can('write')) {
      wrap.appendChild(el('button', { class: 'icon-btn', title: 'تعديل', onclick: () => openModal({ title: 'تعديل المنتخب', content: teamForm(t, load) }) }, '✏️'));
      wrap.appendChild(el('button', {
        class: 'icon-btn danger', title: 'حذف',
        onclick: () => confirmDialog({
          title: 'حذف المنتخب', message: `سيتم حذف ${t.name} نهائيًا.`,
          onConfirm: async () => {
            try { await api.del(`/teams/${t.id}`); toast('تم حذف المنتخب', 'success'); load(); }
            catch (err) { reportError(err); }
          },
        }),
      }, '🗑️'));
    }
    return wrap;
  }

  const categorySelect = el('select', { onchange: (e) => { categoryFilter = e.target.value; load(); } },
    [el('option', { value: '' }, 'جميع الفئات'), ...CATEGORIES.map((c) => el('option', { value: c }, c))]);
  const searchInput = el('input', { type: 'text', placeholder: 'بحث عن منتخب أو دولة...' });
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = searchInput.value.trim(); load(); }, 300);
  });

  const actions = [];
  if (can('write')) {
    actions.push(el('button', { class: 'btn btn-primary', onclick: () => openModal({ title: 'منتخب جديد', content: teamForm(null, load) }) }, ['+ ', 'منتخب جديد']));
  }

  main.appendChild(pageHeader('المنتخبات', 'مرجع الفرق المشاركة', actions));
  main.appendChild(el('div', { class: 'toolbar' }, [searchInput, categorySelect]));
  main.appendChild(el('div', { id: 'teams-list' }));

  load();
}
