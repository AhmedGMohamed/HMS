import { describe, it, expect, beforeAll } from "vitest";
import i18next from "i18next";

import commonEn from "@/locales/common.en.json";
import commonAr from "@/locales/common.ar.json";
import sidebarEn from "@/locales/sidebar.en.json";
import sidebarAr from "@/locales/sidebar.ar.json";
import navigationEn from "@/locales/navigation.en.json";
import navigationAr from "@/locales/navigation.ar.json";
import topbarEn from "@/locales/topbar.en.json";
import topbarAr from "@/locales/topbar.ar.json";
import breadcrumbsEn from "@/locales/breadcrumbs.en.json";
import breadcrumbsAr from "@/locales/breadcrumbs.ar.json";
import breadcrumbEn from "@/locales/breadcrumb.en.json";
import breadcrumbAr from "@/locales/breadcrumb.ar.json";
import userMenuEn from "@/locales/userMenu.en.json";
import userMenuAr from "@/locales/userMenu.ar.json";
import errorsEn from "@/locales/errors.en.json";
import errorsAr from "@/locales/errors.ar.json";
import authEn from "@/locales/auth.en.json";
import authAr from "@/locales/auth.ar.json";
import successEn from "@/locales/success.en.json";
import successAr from "@/locales/success.ar.json";

const NS = "translation";

let i18n: typeof i18next;

beforeAll(async () => {
  i18n = (i18next as unknown as { createInstance: typeof i18next.createInstance })
    .createInstance();
  await i18n.init({
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
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
});

describe("i18n — baked namespaces nested under 'translation'", () => {
  it("resolves common.search → 'Search'", () => {
    expect(i18n.t("common.search")).toBe("Search");
  });

  it("resolves sidebar.dashboard → 'Dashboard'", () => {
    expect(i18n.t("sidebar.dashboard")).toBe("Dashboard");
  });

  it("resolves sidebar.patients → 'Patients'", () => {
    expect(i18n.t("sidebar.patients")).toBe("Patients");
  });

  it("resolves errors.notFoundTitle to its non-empty English string", () => {
    const got = i18n.t("errors.notFoundTitle");
    expect(got).not.toBe("errors.notFoundTitle");
    expect(got).toBeTruthy();
  });

  it("resolves auth.loginError to its non-empty English string", () => {
    const got = i18n.t("auth.loginError");
    expect(got).not.toBe("auth.loginError");
    expect(got).toBeTruthy();
  });

  it("returns the unresolved key when the leaf is missing", () => {
    const got = i18n.t("totally.nonexistent.key");
    expect(got).toBe("totally.nonexistent.key");
  });
});

describe("i18n — language switching", () => {
  it("returns the Arabic value after changeLanguage('ar')", async () => {
    await i18n.changeLanguage("ar");
    const result = i18n.t("common.search");
    expect(result).toBeTruthy();
    expect(result).not.toBe("Search");
  });
});
