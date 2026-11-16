/**
 * Large-export warning — Phase 6.11.7, plan §3.7.
 *
 * Exports are deliberately uncapped, so the only defence is telling the user
 * what they asked for before the document starts building. `ReportShell` owns
 * that strip; each tab passes the row count it already has (`payload.total`, or
 * the statistics series sum).
 *
 * The dev database can never reach 5,000 rows, so this is asserted at the
 * component level instead of through a live browser check. Two things are worth
 * guarding:
 *
 *   1. the threshold is `>`, not `>=`, so 5,000 rows stays quiet;
 *   2. `t(..., { count })` triggers i18next pluralisation, which looks for
 *      `largeExport_one` / `_other` before falling back to the base key. The
 *      fallback is what makes a single base string work in both English and
 *      Arabic — a regression there would render the raw key.
 */

import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import i18next from "i18next"
import { beforeAll, describe, expect, it } from "vitest"

import reportsAr from "@/locales/reports.ar.json"
import reportsEn from "@/locales/reports.en.json"
import { ReportShell } from "@/pages/Reports/components/ReportShell"

const NS = "translation"

let i18n: typeof i18next

beforeAll(async () => {
  i18n = (
    i18next as unknown as { createInstance: typeof i18next.createInstance }
  ).createInstance()
  await i18n.init({
    resources: {
      en: { [NS]: { reports: reportsEn.reports } },
      ar: { [NS]: { reports: reportsAr.reports } },
    },
    ns: [NS],
    defaultNS: NS,
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    interpolation: { escapeValue: false },
    returnNull: false,
  })
})

function render(props: { exportRowCount?: number }): string {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ReportShell
        title="Clock-In Reports"
        onGenerate={() => {}}
        exportRowCount={props.exportRowCount}
      >
        <p>body</p>
      </ReportShell>
    </I18nextProvider>
  )
}

describe("ReportShell — large export warning", () => {
  it("stays quiet when the tab does not report a row count", () => {
    expect(render({})).not.toContain('role="status"')
  })

  it("stays quiet at exactly the threshold", () => {
    const html = render({ exportRowCount: 5000 })
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain("5,000 rows")
  })

  it("warns one row above the threshold and interpolates the count", () => {
    const html = render({ exportRowCount: 5001 })
    expect(html).toContain('role="status"')
    expect(html).toContain("5001 rows")
    // The key must resolve, not leak into the UI.
    expect(html).not.toContain("reports.state.largeExport")
  })

  it("resolves the same key in Arabic", async () => {
    await i18n.changeLanguage("ar")
    const html = render({ exportRowCount: 9000 })
    await i18n.changeLanguage("en")

    expect(html).toContain('role="status"')
    expect(html).toContain("9000")
    expect(html).not.toContain("reports.state.largeExport")
    expect(html).not.toContain("rows")
  })

  it("keeps the base key resolvable despite `count` pluralisation", () => {
    for (const lng of ["en", "ar"]) {
      const resolved = i18n.t("reports.state.largeExport", {
        lng,
        count: 6000,
      })
      expect(resolved).not.toBe("reports.state.largeExport")
      expect(resolved).toContain("6000")
    }
  })
})
