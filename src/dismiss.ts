import { useEffect, useRef } from 'react';

/**
 * Everything Escape can close, oldest first — dialogs and hover cards alike.
 *
 * Escape closes only the top of the stack. A detail dialog opened from inside a picker does
 * not dismiss the picker along with itself, and neither does a hover card opened over one:
 * the card is the newest layer, so it goes first and the dialog underneath stays put. Any
 * surface that closes on Escape belongs here rather than adding a window handler of its own,
 * or it fires on the same event as everything else already listening.
 */
const stack: object[] = [];

/**
 * Whether focus is being handed back rather than sought.
 *
 * A dialog closing returns focus to whatever opened it, which is very often a chip or a stat
 * carrying a hover card. Focus is how the keyboard asks for that card, so the card opened —
 * and, being the newest layer on the stack above, it then swallowed the next Escape, leaving
 * the dialog underneath needing two presses to close. Focus arriving because a layer went
 * away is not the player asking for anything, and the surfaces that open on focus sit this
 * one out.
 */
let restoring = false;

/** Hand focus back to `el` without it reading as the player pointing at it. */
export function restoreFocus(el: HTMLElement | null | undefined) {
  // `isConnected` because the thing that opened a layer is not always still there when it
  // closes — a row removed by the very choice the dialog was making, say. Focusing a
  // detached node silently drops focus on the body, which is worse than leaving it alone.
  if (typeof el?.focus !== 'function' || !el.isConnected) return;
  restoring = true;
  // Focus events are dispatched synchronously from `.focus()`, so everything that was going
  // to react to this has already done so by the time the flag comes down.
  try { el.focus(); } finally { restoring = false; }
}

export const focusIsBeingRestored = () => restoring;

/**
 * Register as the top dismissable layer while `active`, and call `onDismiss` when Escape is
 * pressed with nothing newer on top.
 */
export function useDismissLayer(active: boolean, onDismiss: () => void) {
  const self = useRef({});

  // Membership is tracked apart from the key handler: `onDismiss` is usually a fresh arrow
  // function each render, and re-running this would shuffle an older layer back to the top.
  // The identity is read into a local so the cleanup removes the object it pushed.
  useEffect(() => {
    if (!active) return;
    const me = self.current;
    stack.push(me);
    return () => {
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === self.current) onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onDismiss]);
}
