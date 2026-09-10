import { el, clear, loadingRow, emptyState, formatDate } from '../helpers.js';
import { TOURNAMENT_STATUS_LABELS, CATEGORIES } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';
import { navigate } from '../router.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { can } from '../state.js';

function tournamentForm(existing, onSaved) {
  const isEdit = !!existing;
  const fields = {
    name: el('input', { type: 'text', value: existing?.name || '', placeholder: 'مثال: بطولة كأس الخليج 27' }),
    category: el('select', {}, CATEGORIES.map((c) => el('option', { value: c, selected: existing?.category === c }, c))),
    year: el('input', { type: 'number', value: existing?.year || new Date().getFullYear() }),
    host_country: el('input', { type: 'text', value: existing?.host_country || '' }),
    host_city: el('input', { type: 'text', value: existing?.host_city || '' }),
    start_date: el('input', { type: 'date', value: existing?.start_date?.slice(0, 10) || '' }),
    end_date: el('input', { type: 'date', value: existing?.end_date?.slice(0, 10) || '' }),
    status: el('select', {}, Object.entries(TOURNAMENT_STATUS_LABELS).map(([v, l]) => el('option', { value: v, selected: existing?.status === v }, l))),
  };

  const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:0 0 10px;' });

  const submit = async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    const payload = {
      name: fields.name.value.trim(),
      category: fields.category.value,
      year: Number(fields.year.value),
      host_country: fields.host_country.value.trim(),
      host_city: fields.host_city.value.trim(),
      start_date: fields.start_date.value,
      end_date: fields.end_date.value,
      status: fields.status.value,
    };
    if (!payload.name || !payload.host_country || !payload.start_date || !payload.end_date) {
      errorBox.textContent = 'الرجاء تعبئة جميع الحقول المطلوبة';
      return;
    }
    try {
      if (isEdit) await api.put(`/tournaments/${existing.id}`, payload);
      else await api.post('/tournaments', payload);
      toast(isEdit ? 'تم تحديث البطولة' : 'تم إنشاء البطولة', 'success');
      closeModal();
      onSaved();
    } catch (err) {
      errorBox.textContent = err.message;
    }
  };

  return el('form', { onsubmit: submit }, [
    errorBox,
    el('div', { class: 'field' }, [el('label', {}, 'اسم البطولة'), fields.name]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'الفئة'), fields.category]),
      el('div', { class: 'field' }, [el('label', {}, 'السنة'), fields.year]),
    ]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'الدولة المضيفة'), fields.host_country]),
      el('div', { class: 'field' }, [el('label', {}, 'المدينة المضيفة'), fields.host_city]),
    ]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'تاريخ البداية'), fields.start_date]),
      el('div', { class: 'field' }, [el('label', {}, 'تاريخ النهاية'), fields.end_date]),
    ]),
    el('div', { class: 'field' }, [el('label', {}, 'الحالة'), fields.status]),
    el('div', { class: 'modal-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: closeModal }, 'إلغاء'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'حفظ التعديلات' : 'إنشاء البطولة'),
    ]),
  ]);
}

export async function renderTournaments() {
  const main = getMain();
  clear(main);

  let categoryFilter = '';

  const load = async () => {
    const listWrap = main.querySelector('#tournaments-list');
    clear(listWrap);
    listWrap.appendChild(loadingRow());
    try {
      const query = categoryFilter ? `?category=${encodeURIComponent(categoryFilter)}` : '';
      const { items } = await api.get(`/tournaments${query}`);
      clear(listWrap);
      if (items.length === 0) {
        listWrap.appendChild(emptyState('لا توجد بطولات بعد', 'أنشئ بطولة جديدة للبدء', '🏆'));
        return;
      }
      const grid = el('div', { class: 'grid grid-cols-3' }, items.map((t) => el('div', {
        class: 'card',
        style: 'cursor:pointer',
        onclick: () => navigate(`/tournaments/${t.id}`),
      }, [
        el('div', { class: 'flex-between', style: 'margin-bottom:10px;' }, [
          el('span', { class: 'badge' }, t.category),
          el('span', { class: `badge ${t.status === 'ongoing' ? 'badge-gold' : 'badge-muted'}` }, TOURNAMENT_STATUS_LABELS[t.status] || t.status),
        ]),
        el('h3', { style: 'margin:0 0 6px;font-size:18px;' }, t.name),
        el('p', { class: 'text-muted', style: 'margin:0 0 4px;font-size:12px;' }, `📍 ${t.host_country}${t.host_city ? ' - ' + t.host_city : ''}`),
        el('p', { class: 'text-muted', style: 'margin:0;font-size:12px;' }, `📅 ${formatDate(t.start_date)} → ${formatDate(t.end_date)}`),
      ])));
      clear(listWrap);
      listWrap.appendChild(grid);
    } catch (err) {
      clear(listWrap);
      reportError(err);
    }
  };

  const categorySelect = el('select', {
    onchange: (e) => { categoryFilter = e.target.value; load(); },
  }, [el('option', { value: '' }, 'جميع الفئات'), ...CATEGORIES.map((c) => el('option', { value: c }, c))]);

  const actions = [];
  if (can('write')) {
    actions.push(el('button', {
      class: 'btn btn-primary',
      onclick: () => openModal({
        title: 'بطولة جديدة',
        content: tournamentForm(null, load),
      }),
    }, ['+ ', 'بطولة جديدة']));
  }

  main.appendChild(pageHeader('البطولات', 'سجل بطولة قابل للتشغيل', actions));
  main.appendChild(el('div', { class: 'toolbar' }, [categorySelect]));
  main.appendChild(el('div', { id: 'tournaments-list' }));

  load();
}

export { tournamentForm };
