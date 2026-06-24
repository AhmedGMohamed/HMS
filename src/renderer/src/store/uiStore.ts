import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * UI state owned by the renderer.
 *
 * Sidebar collapse state is intentionally NOT stored here — the shadcn
 * `SidebarProvider` already persists it under its own `sidebar_state`
 * cookie and we treat that as the single source of truth. Storing a
 * parallel value here previously caused drift between the persisted
 * user preference and the provider's internal state on remount.
 *
 * Locale persistence (Phase 6.1 fix):
 *   The initial `language` is seeded from `localStorage.lang` (the key
 *   `i18next-browser-languagedetector` reads from). Without this, the
 *   store's `language: 'en'` default would clobber the persisted Arabic
 *   preference on cold start, because `<RTLSync />` runs an effect on
 *   mount that calls `i18n.changeLanguage(language)` + writes
 *   `localStorage.lang = language`. Seeding from the persisted value
 *   turns that effect into a no-op for users who already have a
 *   preference.
 */
export type Language = "en" | "ar"

function readPersistedLanguage(): Language {
  if (typeof window === "undefined") return "en"
  try {
    const stored = window.localStorage.getItem("lang")
    return stored === "ar" ? "ar" : "en"
  } catch {
    return "en"
  }
}

interface UIState {
  language: Language

  setLanguage: (lang: Language) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      language: readPersistedLanguage(),

      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: "hms-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ language: state.language }),
      version: 2,
    }
  )
)
