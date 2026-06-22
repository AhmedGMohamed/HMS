import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type Language = "en" | "ar"

interface UIState {
  sidebarCollapsed: boolean
  language: Language

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setLanguage: (lang: Language) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      language: "en",

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: "hms-ui",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
