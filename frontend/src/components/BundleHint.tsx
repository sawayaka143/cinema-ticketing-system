import { BUNDLE_LABEL_KEY, BUNDLE_PCT, type BundleItem, bundleFor, bundleNudge, bundleSaving } from "../lib/bundles";
import { price } from "../lib/format";
import { useI18n } from "../lib/i18n";
import "./bundle-hint.css";

/**
 * Under the picked seats: the family or group deal these tickets get (with the estimated saving),
 * or a tip that gets the customer closer to one. The API works out the real price at hold time.
 */
export function BundleHint({ items, childAllowed }: { items: BundleItem[]; childAllowed: boolean }) {
  const { t } = useI18n();
  const types = items.map((i) => i.type);
  const bundle = bundleFor(types);

  if (bundle) {
    const pct = BUNDLE_PCT[bundle];
    const saving = bundleSaving(items, bundle);
    return (
      <p className="bundle-hint is-applied" role="status">
        <GiftIcon />
        <span>
          <b>{t(BUNDLE_LABEL_KEY[bundle])}</b> −{pct}% ·{" "}
          {t("bundle.saveAbout", { amount: price(String(saving)) })}
        </span>
      </p>
    );
  }

  const nudge = bundleNudge(types, childAllowed);
  if (!nudge) return null;
  return (
    <p className="bundle-hint" role="status">
      <GiftIcon />
      <span>{t(nudge.key, nudge.vars)}</span>
    </p>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="6" width="12" height="3" rx="0.8" />
      <path d="M3 9v4.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8V9M8 6v8" />
      <path d="M8 6C6.6 6 5 5.4 5 4.1 5 3 6.1 2.4 7 3.2 7.6 3.8 8 6 8 6Zm0 0c1.4 0 3-.6 3-1.9 0-1.1-1.1-1.7-2-.9-.6.6-1 2.8-1 2.8Z" />
    </svg>
  );
}
