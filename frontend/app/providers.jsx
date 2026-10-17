"use client";

import { createInstance } from "i18next";
import { useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import ar from "@/i18n/ar.json";
import en from "@/i18n/en.json";

function createI18n(lang) {
  const i18n = createInstance();
  i18n.use(initReactI18next).init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    lng: lang,
    fallbackLng: "ar",
    interpolation: { escapeValue: false },
    initAsync: false, // resources are bundled, so render translated text on the first pass
    showSupportNotice: false,
  });
  i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = lng;
    document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
    document.cookie = `lang=${lng}; path=/; max-age=31536000; samesite=lax`;
  });
  return i18n;
}

export function Providers({ lang, children }) {
  const [i18n] = useState(() => createI18n(lang));
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
