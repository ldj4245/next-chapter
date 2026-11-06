'use client';

import { useEffect } from 'react';

const keyboardInputs = new Set(['text', 'search', 'email', 'password', 'url', 'tel', 'number']);
const keyboardThreshold = 100;
const edgeGap = 12;

function focusedEditor() {
  const field = document.activeElement;
  if (!(field instanceof HTMLTextAreaElement) &&
      !(field instanceof HTMLInputElement && keyboardInputs.has(field.type))) return null;
  return field.readOnly || field.matches(':disabled') ? null : field;
}

function revealEditor(field: HTMLInputElement | HTMLTextAreaElement, top: number, height: number) {
  const box = field.getBoundingClientRect();
  if (!box.height) return;

  const dialog = field.closest('dialog[open]');
  const dialogBox = dialog?.getBoundingClientRect();
  const upper = Math.max(top, dialogBox?.top ?? top) + edgeGap;
  const lower = Math.min(top + height, dialogBox?.bottom ?? top + height) - edgeGap;
  if (lower <= upper) return;

  // A slash menu sits below its editor on mobile. Keep it visible when
  // there is room to show both without pushing the editor under the keyboard.
  const menu = field.parentElement?.querySelector('[data-editing-companion]');
  const menuBottom = menu?.getBoundingClientRect().bottom ?? box.bottom;
  const bottom = menuBottom - box.top <= lower - upper ? Math.max(box.bottom, menuBottom) : box.bottom;
  const delta = box.top < upper || box.height > lower - upper ? box.top - upper : Math.max(0, bottom - lower);
  if (Math.abs(delta) < 1) return;

  if (dialog) dialog.scrollTop += delta;
  else window.scrollBy({ top: delta, behavior: 'instant' });
}

export function MobileEditingViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const touch = window.matchMedia('(any-pointer: coarse)');
    const viewport = window.visualViewport;
    let restingHeight = root.clientHeight;
    let layoutWidth = root.clientWidth;
    let observed: ReturnType<typeof focusedEditor> = null;
    let frame = 0;
    const observer = new ResizeObserver(queueUpdate);

    function clearKeyboard() {
      if (!root.hasAttribute('data-mobile-keyboard')) return;
      root.removeAttribute('data-mobile-keyboard');
      for (const property of ['--mobile-editing-height', '--mobile-editing-top', '--mobile-keyboard-inset']) {
        root.style.removeProperty(property);
      }
    }

    function update() {
      frame = 0;
      const field = touch.matches ? focusedEditor() : null;
      const layoutHeight = root.clientHeight;
      if (!field || root.clientWidth !== layoutWidth) {
        restingHeight = layoutHeight;
        layoutWidth = root.clientWidth;
      }
      if (observed !== field) {
        observer.disconnect();
        if (field) observer.observe(field);
        observed = field;
      }

      const height = Math.min(layoutHeight, viewport?.height ?? window.innerHeight);
      const zoomed = Math.abs((viewport?.scale ?? 1) - 1) > 0.02;
      if (!field || zoomed || Math.max(layoutHeight, restingHeight) - height < keyboardThreshold) {
        clearKeyboard();
        return;
      }

      const top = Math.max(0, viewport?.offsetTop ?? 0);
      root.setAttribute('data-mobile-keyboard', '');
      root.style.setProperty('--mobile-editing-height', `${Math.floor(height)}px`);
      root.style.setProperty('--mobile-editing-top', `${Math.round(top)}px`);
      root.style.setProperty('--mobile-keyboard-inset', `${Math.ceil(layoutHeight - height)}px`);
      revealEditor(field, top, height);
    }

    function queueUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    // Wait for the browser's viewport and the committed editor size before
    // scrolling. Page scroll is intentionally not watched while reading.
    const events = ['focusin', 'focusout', 'input', 'selectionchange'];
    events.forEach(event => document.addEventListener(event, queueUpdate, true));
    window.addEventListener('resize', queueUpdate);
    viewport?.addEventListener('resize', queueUpdate);
    viewport?.addEventListener('scroll', queueUpdate);
    touch.addEventListener('change', queueUpdate);
    queueUpdate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      events.forEach(event => document.removeEventListener(event, queueUpdate, true));
      window.removeEventListener('resize', queueUpdate);
      viewport?.removeEventListener('resize', queueUpdate);
      viewport?.removeEventListener('scroll', queueUpdate);
      touch.removeEventListener('change', queueUpdate);
      clearKeyboard();
    };
  }, []);

  return null;
}
