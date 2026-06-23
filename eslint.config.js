import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * `hms-snake/no-snake-case` — enforced only on JSX attributes inside the
 * renderer (`src/renderer/src`). Catches the common mistake of reading a
 * server-aligned snake_case field directly into JSX where auto-mapping
 * would have been the right move.
 *
 * We deliberately do NOT lint `Identifier` nodes: dozens of `*_CLASS`,
 * `*_CONFIG`, `COLOR_SCHEME_QUERY` constant names predate the rule and
 * PHP/JS convention here has long accepted upper-snake for module-level
 * constants. Static type-tracking would be needed to differentiate
 * domain constants from API-map identifiers.
 */
const snakeCaseGuard = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Snake-case JSX attribute names signal a server passthrough that lib/api.ts should be normalizing — use camelCase.',
    },
    schema: [],
    messages: {
      snakeJsx:
        'JSX attribute "{{name}}" is snake_case — server responses are camelCase-mapped in lib/api.ts.',
    },
  },
  create(context) {
    const filename = context.filename || ''
    const normalized = filename.replace(/\\/g, '/')
    const isRenderer = normalized.includes('renderer/src/')
    if (!isRenderer) return {}
    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name
        if (typeof name !== 'string' || !/_/.test(name)) return
        // JSX identifiers in shadcn primitives occasionally use ALL_CAPS
        // (e.g. SVG path `viewBox`). Allow a triplet of letters followed
        // by `_rest` to be exempted as domain acronyms like "RTL" not
        // covered here — keep the rule simple for Phase 6.
        if (name.length < 6) return
        context.report({
          node,
          messageId: 'snakeJsx',
          data: { name },
        })
      },
    }
  },
}

export default defineConfig([
  globalIgnores(['dist', 'build', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'hms-snake': { rules: { 'no-snake-case': snakeCaseGuard } },
    },
    rules: {
      'hms-snake/no-snake-case': 'warn',
    },
  },
])
