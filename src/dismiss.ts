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
