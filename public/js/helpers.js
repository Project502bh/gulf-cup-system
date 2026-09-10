export const ROLE_LABELS = {
  admin: 'مدير النظام',
  tournament_manager: 'مدير بطولة',
  data_entry: 'مدخل بيانات',
  results_reviewer: 'مراجع نتائج',
  viewer: 'مشاهد أو محلل',
};

export const TOURNAMENT_STATUS_LABELS = {
  upcoming: 'قادمة',
  ongoing: 'جارية',
  completed: 'منتهية',
  cancelled: 'ملغاة',
};

export const MATCH_STATUS_LABELS = {
  scheduled: 'مجدولة',
  finished: 'منتهية',
};

export const STAGE_LABELS = {
  group: 'دور المجموعات',
  semifinal: 'نصف النهائي',
  final: 'النهائي',
  third_place: 'مركز ثالث',
};

export const CATEGORIES = ['SENIOR', 'U23', 'U20', 'U17', 'WOMEN'];
export const POSITIONS = ['حارس مرمى', 'مدافع', 'وسط', 'مهاجم'];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'disabled') { if (value) node.setAttribute('disabled', ''); }
    else node.setAttribute(key, value);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function toDateInputValue(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

export function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function loadingRow() {
  return el('div', { class: 'loading-row' }, [el('div', { class: 'spinner' }), 'جاري التحميل...']);
}

export function emptyState(title, hint, icon = '📭') {
  return el('div', { class: 'empty-state' }, [
    el('div', { class: 'icon' }, icon),
    el('h4', {}, title),
    hint ? el('p', {}, hint) : null,
  ]);
}

export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
