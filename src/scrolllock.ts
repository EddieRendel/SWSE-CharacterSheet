import { useEffect } from 'react';

/**
 * Hold the page still behind an open dialog.
 *
 * On a touch screen the document itself is the scroller — it has to be, or the browser never
 * retracts its toolbars — and a scroller behind an overlay is one a flick reaches through.
 * `.modal-body` already stops a flick that starts inside the dialog carrying on into the page;
 * this stops the ones that start anywhere else.
 *
 * `position: fixed` rather than `overflow: hidden`, which iOS Safari does not honour on the
 * document. That means the page loses its scroll position, so it is saved and put back —
 * without which every dialog would close with the sheet jumped to the top.
 */

// A count, not a flag. The item detail opens over the item browser, and the picker opens a
// rules dialog over itself: if the inner one released the lock on close, the outer one would
// be left with the page moving behind it.
let held = 0;
let restoreTo = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (held++ === 0) {
      restoreTo = window.scrollY;
      const { style } = document.body;
      style.position = 'fixed';
      style.top = `-${restoreTo}px`;
      style.left = '0';
      style.right = '0';
    }
    return () => {
      if (--held === 0) {
        const { style } = document.body;
        style.position = '';
        style.top = '';
        style.left = '';
        style.right = '';
        window.scrollTo(0, restoreTo);
      }
    };
  }, [active]);
}
