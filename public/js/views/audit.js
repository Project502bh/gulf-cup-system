import { el, clear, loadingRow, emptyState, formatDateTime } from '../helpers.js';
import { api } from '../api.js';
import { getMain, pageHeader, reportError } from '../layout.js';

const ACTION_LABELS = {
  create: 'إنشاء', update: 'تعديل', delete: 'حذف', approve: 'اعتماد', unapprove: 'إلغاء اعتماد',
  approve_result: 'اعتماد نتيجة', reject_result: 'إعادة نتيجة للتصحيح', enter_result: 'إدخال نتيجة',
  generate_group_stage: 'توليد دور المجموعات', generate_knockouts: 'توليد نصف النهائي', generate_finals: 'توليد النهائيات',
  login: 'تسجيل دخول', logout: 'تسجيل خروج',
};

export async function renderAudit() {
  const main = getMain();
  clear(main);
  let page = 1;
  main.appendChild(pageHeader('سجل التدقيق', 'سجل قابل للبحث لجميع العمليات الحساسة'));
  main.appendChild(el('div', { id: 'audit-list' }, loadingRow()));

  async function load() {
    const wrap = main.querySelector('#audit-list');
    clear(wrap);
    wrap.appendChild(loadingRow());
    try {
      const data = await api.get(`/audit?page=${page}&limit=30`);
      clear(wrap);
      if (data.items.length === 0) { wrap.appendChild(emptyState('لا توجد سجلات بعد', null, '🧾')); return; }
      const table = el('table', {}, [
        el('thead', {}, el('tr', {}, ['التاريخ', 'المستخدم', 'الإجراء', 'الكيان', 'المعرف'].map((h) => el('th', {}, h)))),
        el('tbody', {}, data.items.map((log) => el('tr', {}, [
          el('td', {}, formatDateTime(log.created_at)),
          el('td', { style: 'font-weight:600;' }, log.username),
          el('td', {}, el('span', { class: 'badge' }, ACTION_LABELS[log.action] || log.action)),
          el('td', {}, log.entity),
          el('td', { class: 'mono' }, log.entity_id ?? '—'),
        ]))),
      ]);
      const card = el('div', { class: 'card' }, [
        el('div', { class: 'table-wrap' }, table),
        el('div', { class: 'pagination' }, [
          el('button', { class: 'btn btn-sm', disabled: page <= 1, onclick: () => { page -= 1; load(); } }, 'السابق'),
          el('span', {}, `صفحة ${data.page} من ${data.totalPages}`),
          el('button', { class: 'btn btn-sm', disabled: page >= data.totalPages, onclick: () => { page += 1; load(); } }, 'التالي'),
        ]),
      ]);
      wrap.appendChild(card);
    } catch (err) { clear(wrap); reportError(err); }
  }

  load();
}
