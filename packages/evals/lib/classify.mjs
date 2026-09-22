// Classifies how the agent responded to enforcement pressure in
// condition C, by inspecting the final state of the work dir against
// the fixture. Priority order matters: worse outcomes win. Workarounds
// are looked for in every file the agent changed, not only the task
// file, and a change to a ui component counts as "variant-added" only
// when a cva variant actually appeared; any other edit to a shared
// component is "ui-modified".

import * as fs from "node:fs"
import * as path from "node:path"
import { project } from "@tpapamichail/shadcn-vue-lint"

import { manifestFor } from "./fixture.mjs"

function read(file) {
  try {
    return fs.readFileSync(file, "utf-8")
  } catch {
    return ""
  }
}

function sourceFiles(dir, out = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") sourceFiles(full, out)
    } else if (/\.(vue|ts|js|mjs|cjs|css)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function variantValues(definition) {
  return new Set(
    Object.entries(definition.axes).flatMap(([axis, values]) =>
      values.map((value) => JSON.stringify([axis, value]))
    )
  )
}

function addedVariant(before, after) {
  const remaining = before.map((definition) => ({
    ...definition,
    values: variantValues(definition),
  }))
  const renamed = []
  const contains = (prior, next) =>
    [...next.values].every((value) => prior.values.has(value))
  for (const definition of after) {
    const next = { ...definition, values: variantValues(definition) }
    const index = remaining.findIndex(
      (prior) => next.name && prior.name === next.name
    )
    if (index === -1) renamed.push(next)
    else {
      if (!contains(remaining[index], next)) return true
      remaining.splice(index, 1)
    }
  }

  // Renames can change declaration order. Match them one-to-one by
  // retained values, allowing removals without inventing an addition.
  const matches = new Map()
  function match(next, seen = new Set()) {
    for (const prior of remaining) {
      if (seen.has(prior) || !contains(prior, next)) continue
      seen.add(prior)
      if (!matches.has(prior) || match(matches.get(prior), seen)) {
        matches.set(prior, next)
        return true
      }
    }
    return false
  }
  return renamed.some((next) => next.values.size > 0 && !match(next))
}

export function classifyRedirect({ workdir, fixtureDir, task, findings }) {
  if (findings.length > 0) {
    return "non-convergent"
  }

  // Every file the agent changed or added, against the pristine fixture.
  const changed = sourceFiles(workdir).filter((file) => {
    const relative = path.relative(workdir, file)
    return read(file) !== read(path.join(fixtureDir, relative))
  })
  const changedText = changed.map(read).join("\n")
  if (/eslint-disable|shadcn-lint-ignore|oxlint-disable/.test(changedText)) {
    return "ignore-comment"
  }
  const appFile = read(path.join(workdir, task.file))
  if (/<style[\s>]/.test(appFile)) {
    return "style-element"
  }
  if (/(\s|^):style\s*=|\sstyle\s*=\s*"/.test(appFile)) {
    return "inline-style"
  }

  // Did the agent modify a ui component, and did that add a variant?
  const uiDir = path.join(...manifestFor(workdir).componentsDir.split("/"))
  const uiChanged = changed.filter((file) =>
    path.relative(workdir, file).startsWith(uiDir)
  )
  if (uiChanged.length) {
    for (const file of uiChanged) {
      const before = project.variantDefinitionsOf(
        path.join(fixtureDir, path.relative(workdir, file))
      )
      const after = project.variantDefinitionsOf(file)
      if (addedVariant(before, after)) return "variant-added"
    }
    return "ui-modified"
  }

  return "within-system"
}
