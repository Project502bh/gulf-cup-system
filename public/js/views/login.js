import { el, clear } from '../helpers.js';
import { api } from '../api.js';

export function renderLogin(onSuccess) {
  const app = document.getElementById('app');
  clear(app);

  const usernameInput = el('input', { type: 'text', autocomplete: 'username', placeholder: 'اسم المستخدم' });
  const passwordInput = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'كلمة المرور' });
  const errorBox = el('p', { class: 'field .error-text', style: 'color:#C94343;font-size:12px;min-height:16px;margin:0 0 8px;' });

  const submit = async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      errorBox.textContent = 'الرجاء إدخال اسم المستخدم وكلمة المرور';
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'جاري الدخول...';
    try {
      const { user } = await api.post('/auth/login', { username, password });
      onSuccess(user);
    } catch (err) {
      errorBox.textContent = err.message || 'تعذر تسجيل الدخول';
      btn.disabled = false;
      btn.textContent = 'تسجيل الدخول';
    }
  };

  const form = el('form', { onsubmit: submit }, [
    el('div', { class: 'field' }, [el('label', {}, 'اسم المستخدم'), usernameInput]),
    el('div', { class: 'field' }, [el('label', {}, 'كلمة المرور'), passwordInput]),
    errorBox,
    el('button', { type: 'submit', class: 'btn btn-primary' }, 'تسجيل الدخول'),
  ]);

  const card = el('div', { class: 'login-card' }, [
    el('h1', {}, 'إحصائيات كأس الخليج'),
    el('p', { class: 'sub' }, 'بوابة إدارة البطولات والمنتخبات واللاعبين'),
    form,
    el('div', { class: 'login-hint' }, [
      el('div', {}, 'حسابات تجريبية:'),
      el('div', {}, 'admin / admin123 — مدير النظام'),
      el('div', {}, 'manager / manager123 — مدير بطولة'),
      el('div', {}, 'entry / entry123 — مدخل بيانات'),
      el('div', {}, 'reviewer / reviewer123 — مراجع نتائج'),
      el('div', {}, 'viewer / viewer123 — مشاهد أو محلل'),
    ]),
  ]);

  app.appendChild(el('div', { class: 'login-screen' }, [card]));
}
