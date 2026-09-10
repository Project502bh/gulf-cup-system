import { el, clear } from './helpers.js';
import { state } from './state.js';
import { api } from './api.js';
import { navigate } from './router.js';
import { toast } from './toast.js';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'لوحة التحكم', icon: '🏠' },
  { path: '/tournaments', label: 'البطولات', icon: '🏆' },
  { path: '/teams', label: 'المنتخبات', icon: '🛡️' },
  { path: '/players', label: 'اللاعبون', icon: '👥' },
  { path: '/matches', label: 'المباريات', icon: '📅' },
  { path: '/statistics', label: 'الإحصائيات', icon: '📊' },
];

const ADMIN_NAV_ITEMS = [
  { path: '/users', label: 'المستخدمون', icon: '🔐' },
  { path: '/audit', label: 'سجل التدقيق', icon: '🧾' },
];

let mainEl = null;
let sidebarNavEl = null;
let sidebarEl = null;

export function getMain() {
  return mainEl;
}

function isActive(path, current) {
  if (path === '/dashboard') return current === '/dashboard' || current === '/';
  return current === path || current.startsWith(path + '/');
}

export function highlightActiveNav(currentPath) {
  if (!sidebarNavEl) return;
  sidebarNavEl.querySelectorAll('a').forEach((a) => {
    const path = a.getAttribute('data-path');
    a.classList.toggle('active', isActive(path, currentPath));
  });
}

function navLink(item, currentPath) {
  const a = el('a', {
    href: `#${item.path}`,
    'data-path': item.path,
    class: isActive(item.path, currentPath) ? 'active' : '',
  }, [
    el('span', {}, item.label),
    el('span', { class: 'icon' }, item.icon),
  ]);
  return a;
}

export function renderShell(currentPath) {
  const app = document.getElementById('app');
  clear(app);

  const navItems = [...NAV_ITEMS];
  if (state.user && state.user.role === 'admin') navItems.push(...ADMIN_NAV_ITEMS);

  sidebarNavEl = el('nav', {
    class: 'sidebar-nav',
    onclick: (e) => {
      if (e.target.closest('a')) {
        sidebarEl.classList.remove('open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('visible');
      }
    },
  }, navItems.map((item) => navLink(item, currentPath)));

  sidebarEl = el('aside', { class: 'sidebar' }, [
    el('div', { class: 'sidebar-brand' }, [
      el('h1', {}, 'إحصائيات كأس الخليج'),
      el('p', {}, 'بوابة الإدارة الشاملة'),
    ]),
    sidebarNavEl,
    el('div', { class: 'sidebar-user' }, [
      el('div', { class: 'name' }, state.user ? state.user.fullName : ''),
      el('div', { class: 'role' }, state.user ? state.user.roleLabel : ''),
      el('button', {
        onclick: async () => {
          try { await api.post('/auth/logout'); } catch (_) { /* ignore */ }
          state.user = null;
          navigate('/login');
          window.location.reload();
        },
      }, 'تسجيل الخروج'),
    ]),
    el('div', { class: 'sidebar-footer' }, 'الإصدار 1.0'),
  ]);

  mainEl = el('main', { class: 'main' });

  const overlay = el('div', {
    class: 'sidebar-overlay',
    onclick: () => { sidebarEl.classList.remove('open'); overlay.classList.remove('visible'); },
  });
  const menuBtn = el('button', {
    class: 'mobile-menu-btn',
    'aria-label': 'فتح القائمة',
    onclick: () => {
      sidebarEl.classList.toggle('open');
      overlay.classList.toggle('visible');
    },
  }, '☰');
  const topbar = el('div', { class: 'mobile-topbar' }, [menuBtn, el('span', { class: 'mobile-topbar-title' }, 'إحصائيات كأس الخليج')]);

  // topbar lives outside mainEl since every view does clear(getMain()) on render
  const contentWrapper = el('div', { class: 'content-wrapper' }, [topbar, mainEl]);

  const shell = el('div', { class: 'app-shell' }, [sidebarEl, overlay, contentWrapper]);
  app.appendChild(shell);
  return mainEl;
}

export function pageHeader(title, subtitle, actions) {
  return el('div', { class: 'page-header' }, [
    el('div', {}, [
      el('h2', {}, title),
      subtitle ? el('p', { class: 'subtitle' }, subtitle) : null,
    ]),
    actions ? el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;' }, actions) : null,
  ]);
}

export function reportError(err) {
  console.error(err);
  toast(err && err.message ? err.message : 'حدث خطأ غير متوقع', 'error');
}
