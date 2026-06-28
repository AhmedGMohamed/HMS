import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../env"), "")
  const apiTarget = `http://localhost:${env.PORT || "3000"}`

  return {
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/navigation": { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: path.resolve(__dirname, "../../dist-electron/renderer"),
      emptyOutDir: true,
    },
  }
})