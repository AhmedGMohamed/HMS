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
 */
export type Language = "en" | "ar"

interface UIState {
  language: Language

  setLanguage: (lang: Language) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      language: "en",

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
