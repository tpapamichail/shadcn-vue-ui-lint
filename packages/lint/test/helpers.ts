import * as path from "node:path"
import { fileURLToPath } from "node:url"
import tsParser from "@typescript-eslint/parser"
import { RuleTester } from "eslint"
import vueParser from "vue-eslint-parser"

export const PROJECT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/project"
)

// A file inside the fixture project, so components.json, the theme,
// and the ui components resolve.
export const PAGE = path.join(PROJECT, "app/page.vue")

// A file outside any project.
export const OUTSIDE = "/nonexistent/app/page.vue"

export function createTester() {
  return new RuleTester({
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: "module",
        ecmaFeatures: { jsx: false },
      },
    },
  })
}

// A component's template, so a case reads as the markup it is testing.
export function template(markup: string) {
  return `<template>\n${markup}\n</template>\n`
}

// A script-setup block followed by a template.
export function sfc(script: string, markup: string) {
  return `<script setup lang="ts">\n${script}\n</script>\n\n${template(markup)}`
}

export const button = `import { Button } from "@/components/ui/button"`
export const card = `import { Card, CardContent, CardTitle } from "@/components/ui/card"`
export const cn = `import { cn } from "@/lib/utils"`
