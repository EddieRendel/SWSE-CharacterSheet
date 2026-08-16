import { Modal } from './ui';
import { THEMES, useTheme } from '../theme';

/**
 * Choosing a palette. The swatches carry the decision rather than the names: nobody knows
 * what "Kashyyyk" looks like until they see it, and the whole point is the look.
 *
 * Applied on click rather than on a confirm button, so the dialog is a live preview of the
 * page behind it — the topbar, the tabs and the sheet all repaint underneath as you move
 * down the list, which is the only way to judge one of these.
 */
export function ThemePicker({ onClose }: { onClose: () => void }) {
  const [current, choose] = useTheme();

  return (
    <Modal
      title="Theme"
      onClose={onClose}
      footer={<button className="primary" onClick={onClose}>Done</button>}
    >
      <p className="hint" style={{ marginBottom: 12 }}>
        Repaints the app. It is a preference rather than part of a character, so it applies to
        every one of them and travels with this browser rather than with an exported file.
      </p>

      <div className="theme-grid">
        {THEMES.map(t => (
          <button
            key={t.id}
            type="button"
            className={`theme-option${current === t.id ? ' selected' : ''}`}
            aria-pressed={current === t.id}
            onClick={() => choose(t.id)}
          >
            <span className="theme-swatch" aria-hidden="true">
              {t.swatch.map((c, i) => <span key={i} style={{ background: c }} />)}
            </span>
            <span className="grow">
              <span className="theme-name">{t.name}</span>
              <span className="theme-blurb">{t.blurb}</span>
            </span>
            {current === t.id && <span className="badge accent">on</span>}
          </button>
        ))}
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        Only the chrome changes. Green still means healthy or trained, red still means nearly
        dead, and amber still means unfinished — so the sheet reads the same way whatever it
        is wearing.
      </p>
    </Modal>
  );
}
