import { el, clear } from './helpers.js';

let backdropEl = null;

export function closeModal() {
  if (backdropEl) {
    backdropEl.remove();
    backdropEl = null;
  }
}

export function openModal({ title, content, width }) {
  closeModal();
  backdropEl = el('div', {
    class: 'modal-backdrop',
    onclick: (e) => { if (e.target === backdropEl) closeModal(); },
  }, [
    el('div', { class: 'modal', style: width ? `max-width:${width}` : undefined }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, title),
        el('button', { class: 'modal-close', onclick: closeModal }, '×'),
      ]),
      content,
    ]),
  ]);
  document.body.appendChild(backdropEl);
  return closeModal;
}

export function confirmDialog({ title, message, confirmLabel = 'تأكيد', danger = true, onConfirm }) {
  const body = el('div', {}, [
    el('p', { style: 'margin:0 0 4px;color:var(--text-secondary);font-size:13px;line-height:1.8;' }, message),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', onclick: closeModal }, 'إلغاء'),
      el('button', {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        onclick: async () => {
          await onConfirm();
          closeModal();
        },
      }, confirmLabel),
    ]),
  ]);
  openModal({ title, content: body, width: '420px' });
}
