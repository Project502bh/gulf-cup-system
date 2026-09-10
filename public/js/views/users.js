import { el, clear, loadingRow, emptyState, ROLE_LABELS } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { state } from '../state.js';

function userForm(existing, onSaved) {
  const isEdit = !!existing;
  const fields = {
    username: el('input', { type: 'text', value: existing?.username || '', disabled: isEdit }),
    full_name: el('input', { type: 'text', value: existing?.full_name || '' }),
    role: el('select', {}, Object.entries(ROLE_LABELS).map(([v, l]) => el('option', { value: v, selected: existing?.role === v }, l))),
    password: el('input', { type: 'password', placeholder: isEdit ? 'اتركه فارغًا لعدم التغيير' : '' }),
  };
  const errorBox = el('p', { style: 'color:#C94343;font-size:12px;margin:0 0 10px;' });

  const submit = async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    try {
      if (isEdit) {
        const payload = { full_name: fields.full_name.value.trim(), role: fields.role.value };
        if (fields.password.value) payload.password = fields.password.value;
        await api.put(`/users/${existing.id}`, payload);
      } else {
        if (!fields.username.value.trim() || !fields.password.value) {
          errorBox.textContent = 'اسم المستخدم وكلمة المرور مطلوبان';
          return;
        }
        await api.post('/users', {
          username: fields.username.value.trim(),
          password: fields.password.value,
          full_name: fields.full_name.value.trim(),
          role: fields.role.value,
        });
      }
      toast('تم حفظ المستخدم', 'success');
      closeModal();
      onSaved();
    } catch (err) { errorBox.textContent = err.message; }
  };

  return el('form', { onsubmit: submit }, [
    errorBox,
    el('div', { class: 'field' }, [el('label', {}, 'اسم المستخدم'), fields.username]),
    el('div', { class: 'field' }, [el('label', {}, 'الاسم الكامل'), fields.full_name]),
    el('div', { class: 'field' }, [el('label', {}, 'الدور'), fields.role]),
    el('div', { class: 'field' }, [el('label', {}, 'كلمة المرور'), fields.password]),
    el('div', { class: 'modal-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: closeModal }, 'إلغاء'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'حفظ التعديلات' : 'إضافة المستخدم'),
    ]),
  ]);
}

export async function renderUsers() {
  const main = getMain();
  clear(main);
  main.appendChild(pageHeader('المستخدمون والصلاحيات', 'إدارة حسابات النظام وأدوارها', [
    el('button', { class: 'btn btn-primary', onclick: () => openModal({ title: 'مستخدم جديد', content: userForm(null, load) }) }, ['+ ', 'مستخدم جديد']),
  ]));
  main.appendChild(el('div', { id: 'users-list' }, loadingRow()));

  async function load() {
    const wrap = main.querySelector('#users-list');
    clear(wrap);
    wrap.appendChild(loadingRow());
    try {
      const { items } = await api.get('/users');
      clear(wrap);
      if (items.length === 0) { wrap.appendChild(emptyState('لا يوجد مستخدمون', null, '🔐')); return; }
      const table = el('table', {}, [
        el('thead', {}, el('tr', {}, ['اسم المستخدم', 'الاسم الكامل', 'الدور', 'إجراءات'].map((h) => el('th', {}, h)))),
        el('tbody', {}, items.map((u) => el('tr', {}, [
          el('td', { class: 'mono' }, u.username),
          el('td', { style: 'font-weight:600;' }, u.full_name),
          el('td', {}, el('span', { class: 'badge' }, ROLE_LABELS[u.role] || u.role)),
          el('td', {}, [
            el('button', { class: 'icon-btn', title: 'تعديل', onclick: () => openModal({ title: 'تعديل المستخدم', content: userForm(u, load) }) }, '✏️'),
            state.user.id !== u.id ? el('button', {
              class: 'icon-btn danger', title: 'حذف',
              onclick: () => confirmDialog({
                title: 'حذف المستخدم', message: `سيتم حذف حساب ${u.username} نهائيًا.`,
                onConfirm: async () => { try { await api.del(`/users/${u.id}`); toast('تم الحذف', 'success'); load(); } catch (err) { reportError(err); } },
              }),
            }, '🗑️') : null,
          ]),
        ]))),
      ]);
      wrap.appendChild(el('div', { class: 'card' }, el('div', { class: 'table-wrap' }, table)));
    } catch (err) { clear(wrap); reportError(err); }
  }

  load();
}
