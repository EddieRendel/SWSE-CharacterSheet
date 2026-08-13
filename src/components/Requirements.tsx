import type { ReqCheck } from '../rules/prereqs';
import { FeatureTip } from './Tip';
import { REQ_TAGS } from './labels';

/**
 * A list of prerequisites, shared by the feat picker and the class picker so the two can
 * never drift apart.
 *
 * Every line is tagged with what kind of thing it wants, because knowing that "Armor
 * Specialist" is a talent rather than a feat is most of knowing how to go and get it. Lines
 * that name a single feature hover to its rules text — and for a talent that card also lists
 * the tree it belongs to and the classes that draw on it.
 */
export function ReqList({ checks }: { checks: ReqCheck[] }) {
  return (
    <div className="list">
      {checks.map((c, i) => {
        const tag = REQ_TAGS[c.kind];
        const text = <span className={c.met ? 'dim' : 'err'}>{c.text}</span>;
        return (
          <div key={i} className="row req-row">
            <span className={c.met ? 'ok' : 'err'}>{c.met ? '✓' : '✕'}</span>
            {c.ref ? <FeatureTip id={c.ref.id} spec={c.ref.spec}>{text}</FeatureTip> : text}
            {tag && <span className={`badge ${tag.cls}`}>{tag.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
