import { useEffect } from "react"
import { useUIStore } from "@/store/uiStore"
import i18n from "@/i18n"

/**
 * Headless component that keeps `document.documentElement.{dir,lang}` and
 * the `i18next` instance in lockstep with `uiStore.language`. Mounted
 * once in App.tsx.
 *
 * Also persists the language to the legacy `i18n` class's `lang` key in
 * localStorage so the new (react-i18next) and old (custom i18n) reads
 * during any transitional period stay aligned.
 */
export function RTLSync() {
  const language = useUIStore((s) => s.language)

  useEffect(() => {
    const root = document.documentElement
    root.dir = language === "ar" ? "rtl" : "ltr"
    root.lang = language
    i18n.changeLanguage(language)
    try {
      window.localStorage.setItem("lang", language)
    } catch {
      // localStorage may be unavailable in private mode; safe to no-op.
    }
  }, [language])

  return null
}
