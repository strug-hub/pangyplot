/**
 * Toasts: transient status messages in the bottom-right corner.
 *
 * A toast with type 'loading' shows a spinner and stays until it is updated or
 * dismissed, so it can front a long-running request:
 *
 *     const toast = showToast('Building export...', { type: 'loading' });
 *     toast.update('Export ready', { type: 'success' });
 */

const DEFAULT_DURATION = 4000;

function getContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Show a toast.
 *
 * @param {string} message
 * @param {object} [opts]
 * @param {'info'|'success'|'error'|'loading'} [opts.type='info']
 * @param {number} [opts.duration] - ms before auto-dismiss. Ignored for
 *     'loading', which stays until updated or dismissed. 0 disables it.
 * @returns {{ update: (message: string, opts?: object) => void, dismiss: () => void }}
 */
export function showToast(message, { type = 'info', duration } = {}) {
    const el = document.createElement('div');
    const messageEl = document.createElement('span');
    messageEl.className = 'toast-message';

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.innerHTML = '&times;';
    close.setAttribute('aria-label', 'Close');

    getContainer().appendChild(el);

    let timer = null;

    function dismiss() {
        if (timer) clearTimeout(timer);
        if (!el.isConnected) return;
        el.classList.add('toast-out');
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }

    function render(text, toastType, ms) {
        if (timer) clearTimeout(timer);
        el.className = `toast toast-${toastType}`;
        el.replaceChildren();
        if (toastType === 'loading') {
            const spinner = document.createElement('div');
            spinner.className = 'toast-spinner';
            el.appendChild(spinner);
        }
        messageEl.textContent = text;
        el.appendChild(messageEl);
        el.appendChild(close);

        const wait = ms ?? (toastType === 'loading' ? 0 : DEFAULT_DURATION);
        if (wait > 0) timer = setTimeout(dismiss, wait);
    }

    close.addEventListener('click', dismiss);
    render(message, type, duration);

    return {
        update(text, opts = {}) {
            render(text, opts.type ?? type, opts.duration);
        },
        dismiss,
    };
}
