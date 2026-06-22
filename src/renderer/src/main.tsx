import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { Toaster } from "sonner"

import "./index.css"
import "./i18n"

import App from "./App"
import { ThemeProvider } from "@/components/theme-provider"

/**
 * Entry point.
 *
 * Order matters:
 *   1. ./index.css — Tailwind v4 + design tokens resolved before render
 *   2. ./i18n     — sync-loaded so LanguageDetector has populated
 *                    i18next by the time RTLSync runs on first paint
 *   3. BrowserRouter — wrap SPA inside the router so `useLocation()`,
 *                      `useNavigate()`, and lazy chunks all share one
 *                      history instance.
 *   4. Toaster     — Sonner global toast region. `richColors` enables
 *                      success/error/warning/info variants. Position is
 *                      automatically mirrored to `top-left` in RTL by the
 *                      css `[dir="rtl"]` rules plus the Sonner default.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-right" closeButton />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
)
