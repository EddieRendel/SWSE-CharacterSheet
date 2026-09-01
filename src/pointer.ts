/**
 * What the player is pointing at things with. Queried once: a device does not grow a mouse
 * halfway through a session, and the alternative is every dialog re-running a media query it
 * would get the same answer from.
 */

/**
 * Whether a dialog should put the cursor in its first field on open. A pointer means a real
 * keyboard, and typing straight into the search box saves a click. A touch screen means the
 * on-screen keyboard instead, which covers the bottom half of the dialog — the footer with
 * Cancel and the button that commits the choice included — and the dialog cannot give way to
 * it, being sized against a viewport the keyboard is not part of. The player opens it
 * themselves if they want to search; the alternative was every picker opening half-buried.
 *
 * Pointer rather than width: a narrow window on a desktop still has the keyboard for it.
 */
export const autoFocusSearch = window.matchMedia('(pointer: fine)').matches;
