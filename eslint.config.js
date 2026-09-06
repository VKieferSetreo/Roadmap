// ESLint v9 Flat-Config (Migration von .eslintrc.cjs).

import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"

export default tseslint.config(
  { ignores: ["dist", "server", "src/api/generated", "*.config.{js,ts}", "postcss.config.js"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        console: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        File: "readonly",
        Blob: "readonly",
        URL: "readonly",
        DOMParser: "readonly",
        CustomEvent: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLLabelElement: "readonly",
        HTMLHeadingElement: "readonly",
        HTMLParagraphElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLSpanElement: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Testdateien (T-733). Sie liegen unter src/ und fallen damit in die Regeln oben — brauchen aber
  // zweierlei extra:
  //   1. Die Vitest-Globals. vitest.config.ts läuft mit globals: true, ESLint weiß davon nichts
  //      und meldete sonst "describe is not defined" bei jedem Test.
  //   2. Kein react-refresh/only-export-components. Fixture-Builder und Testhilfen exportieren
  //      neben Komponenten auch Funktionen; die Regel schützt den Hot-Reload im Dev-Server und
  //      hat in Tests keinen Gegenstand.
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
)
