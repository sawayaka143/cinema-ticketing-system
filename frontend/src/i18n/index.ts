import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import kk from "./locales/kk.json";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

i18n.use(initReactI18next).init({
  resources: {
    kk: { translation: kk },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: localStorage.getItem("lang") || "ru",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;