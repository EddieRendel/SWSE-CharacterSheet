/// <reference types="vite/client" />

/**
 * The package version, replaced textually at build time by `define` in vite.config.ts.
 *
 * Declared rather than imported so nothing has to pull package.json into the bundle. Read it
 * through a `typeof` guard: outside Vite — the rules test suite runs in plain Node — no
 * substitution happens and the bare identifier would throw.
 */
declare const __APP_VERSION__: string;
