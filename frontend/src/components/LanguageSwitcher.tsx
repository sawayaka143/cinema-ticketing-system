import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "kk", label: "ҚАЗ" },
  { code: "ru", label: "РУС" },
  { code: "en", label: "ENG" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  function change(code: string) {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
  }

  return (
    <div className="lang-switcher" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          className={i18n.language === l.code ? "active" : ""}
          aria-pressed={i18n.language === l.code}
          onClick={() => change(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}