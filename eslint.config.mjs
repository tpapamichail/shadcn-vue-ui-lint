// Same setup as shadcn-ui/cn: TS parser, recommended rules, prettier last.
import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/.registry/",
      "packages/evals/results/",
      "packages/evals/fixture/",
      "packages/lint/test/fixtures/",
      "**/dist-next/",
      ".claude/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Rules walk ESTree nodes from two runtimes (ESLint and Oxlint) whose
    // types differ; the AST is handled untyped on purpose.
    files: ["packages/lint/src/**", "packages/lint/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  prettier
)
