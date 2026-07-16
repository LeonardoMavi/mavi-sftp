// ── Modal genérico ────────────────────────────────────────────────────────────

export function showModal(
  title: string,
  placeholder: string,
  defaultVal = '',
): Promise<string | null> {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay')!;
    const titleEl = document.getElementById('modal-title')!;
    const input   = document.getElementById('modal-input') as HTMLInputElement;
    const options = document.getElementById('modal-options')!;
    const cancel  = document.getElementById('modal-cancel')!;
    const confirm = document.getElementById('modal-confirm')!;

    titleEl.textContent = title;
    input.placeholder   = placeholder;
    input.value         = defaultVal;
    input.classList.remove('hidden');
    options.classList.add('hidden');
    options.innerHTML = '';
    confirm.classList.remove('hidden');
    overlay.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);

    const close = (val: string | null) => {
      overlay.classList.add('hidden');
      cancel.removeEventListener('click', onCancel);
      confirm.removeEventListener('click', onConfirm);
      input.removeEventListener('keydown', onKey);
      resolve(val);
    };

    const onCancel  = () => close(null);
    const onConfirm = () => close(input.value.trim());
    const onKey     = (e: KeyboardEvent) => {
      if (e.key === 'Enter')  close(input.value.trim());
      if (e.key === 'Escape') close(null);
    };

    cancel.addEventListener('click', onCancel);
    confirm.addEventListener('click', onConfirm);
    input.addEventListener('keydown', onKey);
  });
}

export function showOptionsModal<T extends string>(
  title: string,
  options: Array<{ label: string; value: T }>,
): Promise<T | null> {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay')!;
    const titleEl = document.getElementById('modal-title')!;
    const input   = document.getElementById('modal-input') as HTMLInputElement;
    const list    = document.getElementById('modal-options')!;
    const cancel  = document.getElementById('modal-cancel')!;
    const confirm = document.getElementById('modal-confirm')!;

    titleEl.textContent = title;
    input.classList.add('hidden');
    confirm.classList.add('hidden');
    list.innerHTML = '';
    list.classList.remove('hidden');

    const close = (value: T | null) => {
      overlay.classList.add('hidden');
      cancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onCancel = () => close(null);
    const onOverlayClick = (e: MouseEvent) => {
      if (e.target === overlay) close(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
    };

    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'modal-option';
      button.textContent = option.label;
      button.addEventListener('click', () => close(option.value), { once: true });
      list.appendChild(button);
    });

    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKey);
    overlay.classList.remove('hidden');
    (list.querySelector('button') as HTMLButtonElement | null)?.focus();
  });
}

export function initModalOverlayClose(): void {
  document.getElementById('modal-overlay')!.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) {
      document.getElementById('modal-overlay')!.classList.add('hidden');
    }
  });
}
