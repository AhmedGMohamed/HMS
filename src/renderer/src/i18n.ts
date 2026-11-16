import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"

import commonEn from "@/locales/common.en.json"
import sidebarEn from "@/locales/sidebar.en.json"
import navigationEn from "@/locales/navigation.en.json"
import topbarEn from "@/locales/topbar.en.json"
import breadcrumbsEn from "@/locales/breadcrumbs.en.json"
import breadcrumbEn from "@/locales/breadcrumb.en.json"
import userMenuEn from "@/locales/userMenu.en.json"
import errorsEn from "@/locales/errors.en.json"
import authEn from "@/locales/auth.en.json"
import successEn from "@/locales/success.en.json"

import commonAr from "@/locales/common.ar.json"
import sidebarAr from "@/locales/sidebar.ar.json"
import navigationAr from "@/locales/navigation.ar.json"
import topbarAr from "@/locales/topbar.ar.json"
import breadcrumbsAr from "@/locales/breadcrumbs.ar.json"
import breadcrumbAr from "@/locales/breadcrumb.ar.json"
import userMenuAr from "@/locales/userMenu.ar.json"
import errorsAr from "@/locales/errors.ar.json"
import authAr from "@/locales/auth.ar.json"
import successAr from "@/locales/success.ar.json"

/**
 * Init i18next with a single namespace called "translation" that
 * mirrors the legacy monolithic shape:
 *
 *   en: { translation: { common: {...}, sidebar: {...}, ... } }
 *
 * Each per-page JSON file now declares one top-level key named
 * after its own namespace (e.g. `login.en.json = { login: {...} }`),
 * and `localeLoader.addResourceBundle(ns)` deep-merges that record
 * into the shared `translation` namespace, so call sites like
 * `t("common.search")` and `t("login.title")` continue to resolve
 * identically to the pre-split monolithic layout.
 */
const NS = "translation"

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        [NS]: {
          common: commonEn.common,
          sidebar: sidebarEn.sidebar,
          navigation: navigationEn.navigation,
          topbar: topbarEn.topbar,
          breadcrumbs: breadcrumbsEn.breadcrumbs,
          breadcrumb: breadcrumbEn.breadcrumb,
          userMenu: userMenuEn.userMenu,
          errors: errorsEn.errors,
          auth: authEn.auth,
          success: successEn.success,
        },
      },
      ar: {
        [NS]: {
          common: commonAr.common,
          sidebar: sidebarAr.sidebar,
          navigation: navigationAr.navigation,
          topbar: topbarAr.topbar,
          breadcrumbs: breadcrumbsAr.breadcrumbs,
          breadcrumb: breadcrumbAr.breadcrumb,
          userMenu: userMenuAr.userMenu,
          errors: errorsAr.errors,
          auth: authAr.auth,
          success: successAr.success,
        },
      },
    },
    ns: [NS],
    defaultNS: NS,
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
