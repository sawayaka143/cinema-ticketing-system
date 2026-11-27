import { type ChangeEvent, type RefObject, useId, useState } from "react";
import {
  BRAND_LABEL,
  type CardBrand,
  type CardError,
  type CardErrors,
  type CardInput,
  cardBrand,
  cvcLength,
  formatExpiry,
  formatNumber,
  maxNumberLength,
  onlyDigits,
} from "../lib/card";
import { useI18n } from "../lib/i18n";
import "./card-payment.css";

export type CardFieldRefs = Record<keyof CardInput, RefObject<HTMLInputElement | null>>;

/**
 * Bank card details for the simulated payment: a live card preview (it turns over for the
 * security code) and the four fields a real checkout asks for. The values stay in the browser.
 */
export function CardPayment({
  card,
  onChange,
  errors,
  disabled,
  refs,
}: {
  card: CardInput;
  onChange: (card: CardInput) => void;
  /** Shown only after the first pay attempt, then updated as the customer types. */
  errors: CardErrors;
  disabled?: boolean;
  refs: CardFieldRefs;
}) {
  const { t } = useI18n();
  const id = useId();
  const [flipped, setFlipped] = useState(false);
  const brand = cardBrand(card.number);

  const field = (key: keyof CardInput) => ({
    id: `${id}-${key}`,
    ref: refs[key],
    disabled,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined,
  });

  function setNumber(e: ChangeEvent<HTMLInputElement>) {
    const digits = onlyDigits(e.target.value);
    onChange({ ...card, number: digits.slice(0, maxNumberLength(cardBrand(digits))) });
  }

  return (
    <div className="card-pay">
      <CardPreview card={card} brand={brand} flipped={flipped} />

      <div className="card-fields">
        <div className={`card-field card-field-number${errors.number ? " has-error" : ""}`}>
          <label htmlFor={`${id}-number`}>{t("card.numberLabel")}</label>
          <div className="card-input-wrap">
            <input
              {...field("number")}
              name="cc-number"
              autoComplete="cc-number"
              inputMode="numeric"
              placeholder="1234 5678 9012 3456"
              value={formatNumber(card.number)}
              onChange={setNumber}
            />
            <BrandBadge brand={brand} />
          </div>
          <FieldError id={`${id}-number-error`} error={errors.number} />
        </div>

        <div className={`card-field card-field-name${errors.name ? " has-error" : ""}`}>
          <label htmlFor={`${id}-name`}>{t("card.nameLabel")}</label>
          <input
            {...field("name")}
            name="cc-name"
            autoComplete="cc-name"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t("card.namePlaceholder")}
            maxLength={26}
            value={card.name}
            onChange={(e) => onChange({ ...card, name: e.target.value.toUpperCase() })}
          />
          <FieldError id={`${id}-name-error`} error={errors.name} />
        </div>

        <div className={`card-field${errors.expiry ? " has-error" : ""}`}>
          <label htmlFor={`${id}-expiry`}>{t("card.expiryLabel")}</label>
          <input
            {...field("expiry")}
            name="cc-exp"
            autoComplete="cc-exp"
            inputMode="numeric"
            placeholder={t("card.expiryPlaceholder")}
            maxLength={5}
            value={card.expiry}
            onChange={(e) => onChange({ ...card, expiry: formatExpiry(e.target.value, card.expiry) })}
          />
          <FieldError id={`${id}-expiry-error`} error={errors.expiry} />
        </div>

        <div className={`card-field${errors.cvc ? " has-error" : ""}`}>
          <label htmlFor={`${id}-cvc`}>{brand === "amex" ? "CID" : "CVC / CVV"}</label>
          <input
            {...field("cvc")}
            name="cc-csc"
            autoComplete="cc-csc"
            inputMode="numeric"
            type="password"
            placeholder={"•".repeat(cvcLength(brand))}
            maxLength={cvcLength(brand)}
            value={card.cvc}
            onFocus={() => setFlipped(true)}
            onBlur={() => setFlipped(false)}
            onChange={(e) => onChange({ ...card, cvc: onlyDigits(e.target.value).slice(0, cvcLength(brand)) })}
          />
          <FieldError
            id={`${id}-cvc-error`}
            error={errors.cvc}
            hint={brand === "amex" ? t("card.cvcHintFront") : t("card.cvcHintBack")}
          />
        </div>
      </div>

      <p className="card-secure">
        <LockIcon />
        <span>
          {t("card.demoPrefix")}{" "}
          <button
            type="button"
            className="card-test"
            disabled={disabled}
            onClick={() => onChange({ number: "4242424242424242", name: card.name, expiry: card.expiry, cvc: card.cvc })}
          >
            4242 4242 4242 4242
          </button>
          {t("card.demoSuffix")}
        </span>
      </p>
    </div>
  );
}

function FieldError({ id, error, hint }: { id: string; error?: CardError; hint?: string }) {
  const { t } = useI18n();
  if (error) {
    return (
      <p id={id} className="card-error" role="alert">
        {t(error.key, error.vars)}
      </p>
    );
  }
  return hint ? <p className="card-hint">{hint}</p> : null;
}

/** The card as it will look: masked number, holder and expiry on the front, the code on the back. */
function CardPreview({ card, brand, flipped }: { card: CardInput; brand: CardBrand; flipped: boolean }) {
  const { t } = useI18n();
  const length = brand === "amex" ? 15 : Math.max(16, card.number.length);
  // Show the typed digits, keep the middle hidden like a printed receipt, pad the rest with dots.
  const shown = Array.from({ length }, (_, i) => {
    const d = card.number[i];
    if (!d) return "•";
    return i < 4 || i >= length - 4 ? d : "•";
  }).join("");

  return (
    <div className={`card-preview brand-${brand}${flipped ? " is-flipped" : ""}`} aria-hidden="true">
      <div className="card-face card-front">
        <div className="card-top">
          <span className="card-chip" />
          <CardLogo brand={brand} />
        </div>
        <p className="card-number">{formatNumber(shown)}</p>
        <div className="card-bottom">
          <div>
            <small>{t("card.previewHolder")}</small>
            <span>{card.name.trim() || t("card.previewYourName")}</span>
          </div>
          <div className="card-exp">
            <small>{t("card.previewExpires")}</small>
            <span>{card.expiry || t("card.expiryPlaceholder")}</span>
          </div>
        </div>
      </div>
      <div className="card-face card-back">
        <span className="card-stripe" />
        <div className="card-sign">
          <span className="card-cvc">{card.cvc.replace(/\d/g, "•") || "•".repeat(cvcLength(brand))}</span>
        </div>
        <small className="card-back-note">{t("card.previewBackNote")}</small>
      </div>
    </div>
  );
}

function CardLogo({ brand }: { brand: CardBrand }) {
  const { t } = useI18n();
  if (brand === "mastercard") {
    return (
      <svg className="card-brand" viewBox="0 0 48 30" width="48" height="30">
        <circle cx="18" cy="15" r="11" fill="#eb001b" />
        <circle cx="30" cy="15" r="11" fill="#f79e1b" fillOpacity="0.9" />
      </svg>
    );
  }
  return (
    <span className={`card-brand card-brand-text brand-text-${brand}`}>
      {brand === "unknown" ? t("card.brandUnknown") : BRAND_LABEL[brand]}
    </span>
  );
}

function BrandBadge({ brand }: { brand: CardBrand }) {
  if (brand === "unknown") return null;
  return <span className={`card-badge badge-${brand}`}>{BRAND_LABEL[brand]}</span>;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
    </svg>
  );
}
