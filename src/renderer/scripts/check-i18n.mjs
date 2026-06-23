// Shebang-equivalent: when run via `node check-i18n.mjs`, the parser
// must read this as valid JS, not fall over the leading `/**` after
// the shebang. We intentionally use `//`-form annotations above the
// tools to avoid that constraint.
//
/**
 * Renderer-side i18n audit.
 *
 * Scans `src/renderer/src/**//*.{ts,tsx}` for translation keys, then
 * matches them against the keys declared in `locales/*.json`.
 *
 * Patterns detected (covering `react-i18next` use-cases):
 *   t("key") · t('key') · t(`key`)          — direct call site
 *   useTranslation().t(...)                 — chained via the hook
 *   i18n.t(...)                             — explicit module import
 *   label: "..."                            — NAV_CONFIG style static key
 *   titleKey / breadcrumb key strings       — page-level i18n keys passed via props
 *
 * Flags:
 *   --strict        exit non-zero if any missing or unused keys exist
 *   --src=DIR       override scan root (defaults to "src/renderer/src")
 *   --locale=A,B    limit audit to specific locales (defaults to en,ar)
 *
 * Reports:
 *   MISSING — keys referenced in code but absent from a locale
 *   UNUSED   — keys present in a locale but not referenced in code
 *
 * The legacy `src/app/check-i18n-keys.js` audit continues to cover the
 * vanilla HTML/TS surface (`views/js/**//*.ts`, `views/**//*.html`); this
 * script focuses on the React renderer.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "../../..")

const DEFAULTS = {
  srcDir: "src/renderer/src",
  localeDir: "src/renderer/src/locales",
  locales: ["en", "ar"],
}

const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
}

function log(message, color = "reset") {
  console.log(`${ANSI[color]}${message}${ANSI.reset}`)
}

function parseArgs(argv) {
  const out = { strict: false, src: DEFAULTS.srcDir, locales: DEFAULTS.locales }
  for (const arg of argv.slice(2)) {
    if (arg === "--strict") out.strict = true
    else if (arg.startsWith("--src=")) out.src = arg.slice(6)
    else if (arg.startsWith("--locale="))
      out.locales = arg.slice(9).split(",").map((s) => s.trim()).filter(Boolean)
  }
  return out
}

/** Read JSON safely. */
function readJSON(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"))
}

/**
 * Recursively walk `dir` and return all file paths whose extension is
 * in `exts`. Hidden / node_modules paths skipped.
 */
function walk(dir, exts, root = dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.name.startsWith(".")) continue
    if (entry.name === "node_modules") continue
    if (entry.isDirectory()) {
      walk(full, exts, root, out)
      continue
    }
    const ext = path.extname(entry.name)
    if (exts.includes(ext)) out.push(full)
  }
  return out
}

/**
 * Translation strategies applied in order. Each strategy returns a
 * Set<string> of keys found in the file's contents.
 */
const STRATEGIES = [
  /** Bare `t("...")` / `t('...')` / `t(\`...\`)` calls. */
  {
    name: "t() calls",
    regex: /\.t\s*\(\s*['"`]([A-Za-z_][\w.\[\]]*)['"`]/g,
  },
  /** `i18n.t("...")` chained on the default export. */
  {
    name: "i18n.t()",
    regex: /(?<![A-Za-z0-9_])i18n\.t\s*\(\s*['"`]([A-Za-z_][\w.\[\]]*)['"`]/g,
  },
  /** `useTranslation().t("...")` chained from useTranslation. */
  {
    name: "useTranslation().t()",
    regex: /useTranslation\(\)[^;]*?\.t\s*\(\s*['"`]([A-Za-z_][\w.\[\]]*)['"`]/g,
  },
  /** Static-key properties commonly fed to props — e.g., NAV_CONFIG or page title keys. */
  {
    name: "static label / titleKey values",
    /**
     * Captures the *value* of `key: "..."` style declarations where the
     * key is exactly `label`/`titleKey`/`title`. Limiting the key list
     * keeps us from accidentally swallowing unrelated string literals.
     */
    regex: /(?:label|titleKey|titleKey=?)\s*[:=]\s*['"`]([a-z_][\w.]*?)['"`]/g,
  },
]

const IGNORED_SOURCE_SEGMENTS = [
  "/_dev/",
  "/components/ui/", // generated shadcn primitives — irrelevant i18n surface
  "/types/",
]

function isIgnoredSource(absPath, repoRoot) {
  const norm = absPath.replace(/\\/g, "/")
  const rel = path.relative(repoRoot, absPath).replace(/\\/g, "/")
  return IGNORED_SOURCE_SEGMENTS.some(
    (seg) => rel.includes(seg) || norm.endsWith(seg)
  )
}

function extractKeys(filePath) {
  const content = fs.readFileSync(filePath, "utf8")
  const keys = new Set()
  for (const strategy of STRATEGIES) {
    strategy.regex.lastIndex = 0
    let match
    while ((match = strategy.regex.exec(content)) !== null) {
      const key = match[1].replace(/\[\d+\]/g, "")
      if (key.length > 1) keys.add(key)
    }
  }
  return keys
}

/** Walk a nested JSON object and return all leaf paths. */
function collectKeyPaths(obj, prefix = "") {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeyPaths(v, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

function getNested(obj, pathKey) {
  const parts = pathKey.split(".")
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = cur[p]
  }
  return cur
}

function main() {
  const args = parseArgs(process.argv)
  const srcAbs = path.resolve(repoRoot, args.src)
  const localeAbs = path.resolve(repoRoot, "src/renderer/src/locales")

  log(
    `\n${"=".repeat(60)}\n${ANSI.bold}RENDERER i18n AUDIT${ANSI.reset}\n${"=".repeat(60)}`,
    "cyan"
  )
  log(`Scan root: ${path.relative(repoRoot, srcAbs)}`, "blue")
  log(`Locales:   ${args.locales.join(", ")}`, "blue")

  const exts = [".ts", ".tsx"]
  const files = walk(srcAbs, exts)
  log(`Source files: ${files.length}`, "blue")

  const used = new Map() // key → Set<relativePath>
  for (const file of files) {
    if (isIgnoredSource(file, repoRoot)) continue
    const keys = extractKeys(file)
    if (keys.size === 0) continue
    const rel = path.relative(repoRoot, file)
    for (const k of keys) {
      if (!used.has(k)) used.set(k, new Set())
      used.get(k).add(rel)
    }
  }
  log(`Unique keys used in code: ${used.size}`, "bold")

  // Load locales
  const locales = {}
  for (const loc of args.locales) {
    const file = path.join(localeAbs, `${loc}.json`)
    if (!fs.existsSync(file)) {
      log(`Missing locale file: ${path.relative(repoRoot, file)}`, "red")
      process.exit(2)
    }
    locales[loc] = readJSON(file)
    log(`✓ Loaded ${loc}.json (${collectKeyPaths(locales[loc]).length} keys)`, "green")
  }

  // MISSING
  let missingTotal = 0
  for (const loc of args.locales) {
    const localeKeys = new Set(collectKeyPaths(locales[loc]))
    const missing = []
    for (const [key, files] of used.entries()) {
      if (!getNested(locales[loc], key)) {
        missing.push({ key, files: Array.from(files) })
      }
    }
    if (missing.length === 0) {
      log(`\n  ✓ ${loc}.json — no missing keys`, "green")
    } else {
      missingTotal += missing.length
      log(`\n  ✗ ${loc}.json — ${missing.length} missing keys`, "red")
      for (const { key, files } of missing.slice(0, 30)) {
        log(`    - ${key}`, "yellow")
        for (const f of files) log(`        from: ${f}`, "blue")
      }
      if (missing.length > 30)
        log(`    …and ${missing.length - 30} more`, "yellow")
    }
  }

  // UNUSED
  let unusedTotal = 0
  for (const loc of args.locales) {
    const localeKeys = collectKeyPaths(locales[loc])
    const unused = localeKeys.filter((k) => !used.has(k))
    if (unused.length === 0) {
      log(`\n  ✓ ${loc}.json — no unused keys`, "green")
    } else {
      unusedTotal += unused.length
      log(
        `\n  ! ${loc}.json — ${unused.length} potentially unused keys`,
        "yellow"
      )
      for (const k of unused) log(`    - ${k}`, "yellow")
    }
  }

  log(
    `\n${"=".repeat(60)}\nSUMMARY${ANSI.reset}\n${"=".repeat(60)}`,
    "cyan"
  )
  log(`Keys used in code:    ${used.size}`, "blue")
  log(
    `Missing translations: ${missingTotal}`,
    missingTotal > 0 ? "red" : "green"
  )
  log(
    `Potentially unused:   ${unusedTotal}`,
    unusedTotal > 0 ? "yellow" : "green"
  )

  if (args.strict && (missingTotal > 0 || unusedTotal > 0)) {
    log("\n✗ Strict mode: failing build.", "red")
    process.exit(1)
  }
  log("\n✓ Audit complete.\n", "green")
}

main()
