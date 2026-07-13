// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast } from '../../pangyplot/static/js/ui/elements/toast.js';

function toasts() {
    return document.querySelectorAll('#toast-container .toast');
}

beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('showToast', () => {
    it('creates the container lazily and shows the message', () => {
        showToast('Preparing GFA...');

        expect(document.getElementById('toast-container')).not.toBeNull();
        expect(toasts()).toHaveLength(1);
        expect(toasts()[0].textContent).toContain('Preparing GFA...');
    });

    it('reuses a single container for multiple toasts', () => {
        showToast('one');
        showToast('two');

        expect(document.querySelectorAll('#toast-container')).toHaveLength(1);
        expect(toasts()).toHaveLength(2);
    });

    it('applies the type as a class', () => {
        showToast('boom', { type: 'error' });

        expect(toasts()[0].classList.contains('toast-error')).toBe(true);
    });

    it('shows a spinner only while loading', () => {
        showToast('working', { type: 'loading' });

        expect(toasts()[0].querySelector('.toast-spinner')).not.toBeNull();

        showToast('done', { type: 'success' });
        expect(toasts()[1].querySelector('.toast-spinner')).toBeNull();
    });

    it('auto-dismisses a normal toast', () => {
        showToast('bye');

        vi.advanceTimersByTime(4000);
        toasts()[0].dispatchEvent(new Event('animationend'));

        expect(toasts()).toHaveLength(0);
    });

    it('keeps a loading toast until it is updated or dismissed', () => {
        // A long export must not have its progress toast vanish mid-request.
        showToast('exporting', { type: 'loading' });

        vi.advanceTimersByTime(60000);

        expect(toasts()).toHaveLength(1);
    });

    it('update swaps the message and type, and lets it auto-dismiss', () => {
        const toast = showToast('exporting', { type: 'loading' });

        toast.update('Downloaded chrY_export.zip', { type: 'success' });

        expect(toasts()[0].textContent).toContain('Downloaded chrY_export.zip');
        expect(toasts()[0].classList.contains('toast-success')).toBe(true);
        expect(toasts()[0].querySelector('.toast-spinner')).toBeNull();

        vi.advanceTimersByTime(4000);
        toasts()[0].dispatchEvent(new Event('animationend'));
        expect(toasts()).toHaveLength(0);
    });

    it('dismiss removes the toast', () => {
        const toast = showToast('bye', { type: 'loading' });

        toast.dismiss();
        toasts()[0].dispatchEvent(new Event('animationend'));

        expect(toasts()).toHaveLength(0);
    });

    it('the close button dismisses the toast', () => {
        showToast('bye', { type: 'loading' });

        toasts()[0].querySelector('.toast-close').click();
        toasts()[0].dispatchEvent(new Event('animationend'));

        expect(toasts()).toHaveLength(0);
    });

    it('duration 0 disables auto-dismiss', () => {
        showToast('sticky', { duration: 0 });

        vi.advanceTimersByTime(60000);

        expect(toasts()).toHaveLength(1);
    });

    it('renders the message as text, not markup', () => {
        showToast('<img src=x onerror=alert(1)>');

        expect(toasts()[0].querySelector('img')).toBeNull();
        expect(toasts()[0].textContent).toContain('<img src=x onerror=alert(1)>');
    });
});
