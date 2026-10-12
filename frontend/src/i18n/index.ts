import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./ar.json";
import en from "./en.json";

const saved = (() => {
  try {
    return localStorage.getItem("lang");
  } catch {
    return null;
  }
})();

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: saved === "en" ? "en" : "ar", // Arabic is the default
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

function applyDirection(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
}

applyDirection(i18n.language);
i18n.on("languageChanged", (lng) => {
  applyDirection(lng);
  try {
    localStorage.setItem("lang", lng);
  } catch {
    /* storage unavailable */
  }
});

export default i18n;
