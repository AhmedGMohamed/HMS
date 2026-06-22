import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"

import en from "@/locales/en.json"
import ar from "@/locales/ar.json"

/**
 * Initialise react-i18next once at app boot.
 *
 * The locale key is intentionally named `lang` (per plan §Phase 1) so the
 * persisted value is interchangeable between the legacy `i18n` class and
 * the new store. uiStore keeps a copy under `hms-ui` for runtime use;
 * RTLSync stays in sync by updating both sides on language toggle.
 */
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: "lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  })

export default i18n
