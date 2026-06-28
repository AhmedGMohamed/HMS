/**
 * Lazy pdfmake loader for the Patients module.
 *
 * The package `@digicole/pdfmake-rtl` ships **two** builds:
 *  - `index.js`           — Node CommonJS, exports the `PdfPrinter` class
 *  - `build/pdfmake.js`   — browser UMD bundle that sets `_global.pdfMake`
 *  - `build/vfs_fonts.js` — browser UMD IIFE that registers its VFS via
 *                            `_global.pdfMake.addVirtualFileSystem(vfs)` if
 *                            `pdfMake` is reachable on the global.
 *
 * For the renderer (Vite + Electron Chromium), `package.json#browser`
 * field already points at `build/pdfmake.js`, so a bare
 * `import("@digicole/pdfmake-rtl")` is sufficient. We then read back
 * `window.pdfMake` — the UMD wrapper sets it during evaluation.
 *
 * Vite's `optimizeDeps.esbuildOptions` is configured in
 * `vite.config.ts` to recognise `pdfmake` as a CJS dependency which
 * also gives us a working interop, but to keep things explicit we
 * import the bundle URL directly.
 *
 * The `loadPdfMake()` cache is module-level so:
 *  - first print trigger pays the ~150 KB lazy-chunk cost (one time)
 *  - subsequent prints return synchronously
 *  - RTL pre-processing is baked into the printer/process pipeline by
 *    `@digicole/pdfmake-rtl` itself (no per-call setup needed).
 */

export interface PdfMake {
  createPdf: (docDefinition: unknown) => PdfDocument
  addVirtualFileSystem: (vfs: Record<string, string>) => void
  addFonts: (fonts: Record<string, unknown>) => void
  setFonts: (fonts: Record<string, unknown>) => void
  vfs?: Record<string, string>
}

interface PdfDocument {
  open: () => void
  download: (name?: string) => void
  print: () => void
  getBlob: (cb: (blob: Blob) => void) => void
  getBuffer: (cb: (buffer: ArrayBuffer) => void) => void
}

declare global {
  interface Window {
    pdfMake?: PdfMake
  }
}

const cache: { ready?: Promise<PdfMake> } = {}

export function loadPdfMake(): Promise<PdfMake> {
  if (cache.ready) return cache.ready

  cache.ready = (async () => {
    /* 1. Import the browser UMD bundle (sets window.pdfMake as a
          side-effect). The Vite-resolved URL lands on
          `build/pdfmake.js` per the package's `browser` field. */
    await import(
      /* @vite-ignore */
      "@digicole/pdfmake-rtl/build/pdfmake.js"
    )

    /* 2. Import the vfs_fonts bundle. It side-effects:
          if (typeof _global.pdfMake !== 'undefined') {
            _global.pdfMake.addVirtualFileSystem(vfs);
          }
          so we MUST import it AFTER step 1. */
    await import(
      /* @vite-ignore */
      "@digicole/pdfmake-rtl/build/vfs_fonts.js"
    )

    const pdfMake = typeof window !== "undefined" ? window.pdfMake : undefined
    if (!pdfMake) {
      throw new Error(
        "[patients/pdfmake] window.pdfMake did not register after UMD load."
      )
    }
    return pdfMake
  })()

  return cache.ready
}

/** Test-only escape hatch — Vite hot-reloads occasionally leave us
 *  with a half-initialised cache. Resets the lazy promise so a
 *  re-mount triggers a fresh load. */
export function resetPdfMakeForTest() {
  cache.ready = undefined
}
