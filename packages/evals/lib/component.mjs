// Harness validity checks for a generated task file. Vue SFCs only:
// the file must parse, its script blocks must import what the template
// uses, and every local import must resolve to a real file whose
// component export is reachable through the barrel. Generated modules
// are never imported or invoked while deciding whether a task
// delivered a component.

import * as fs from "node:fs"
import * as path from "node:path"
import parser from "@typescript-eslint/parser"

function nameOf(node) {
  return node?.name ?? node?.value
}

const EXTENSIONS = [".vue", ".ts", ".js", ".mjs", ".cjs"]

function resolveLocal(source, file, workdir) {
  if (!source.startsWith(".") && !source.startsWith("@/")) return null
  const base = source.startsWith("@/")
    ? path.join(workdir, source.slice(2))
    : path.resolve(path.dirname(file), source)
  const stem = EXTENSIONS.some((ext) => base.endsWith(ext))
    ? base.replace(/\.[cm]?[jt]s$/, "")
    : base
  const candidates = [
    base,
    ...EXTENSIONS.flatMap((ext) => [
      stem + ext,
      path.join(base, `index${ext}`),
    ]),
  ]
  return (
    candidates.find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ) ?? null
  )
}

function scriptBlocks(source) {
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1]
  )
}

function templateOf(source) {
  const start = source.search(/<template[\s>]/)
  const end = source.lastIndexOf("</template>")
  if (start === -1 || end === -1 || end < start) return null
  return source.slice(start, end)
}

const BUILTIN_TAGS = new Set([
  "Transition",
  "TransitionGroup",
  "KeepAlive",
  "Teleport",
  "Suspense",
  "Component",
])

function pascalCase(tag) {
  return tag.replace(/(^|-)([a-z])/g, (_, dash, letter) => letter.toUpperCase())
}

// Component tags the template uses without a script binding: Vue would
// render them as unknown custom elements, so the page is broken.
function unresolvedTags(source, bindings) {
  const template = templateOf(source)
  if (!template) return []
  const offset = source.indexOf(template)
  const unresolved = []
  const tag = /<([A-Za-z][\w-]*)(?=[\s/>])/g
  for (let match = tag.exec(template); match; match = tag.exec(template)) {
    const name = match[1]
    if (!/^[A-Z]/.test(name) && !name.includes("-")) continue
    const normalized = pascalCase(name)
    if (BUILTIN_TAGS.has(normalized) || bindings.has(normalized)) continue
    const line = source.slice(0, offset + match.index).split("\n").length
    unresolved.push({ name: normalized, line })
  }
  return unresolved
}

// Resolve callable exports from source only. Generated modules are never
// imported or invoked while deciding whether a task delivered a component.
export async function readComponent(workdir, taskFile) {
  const modules = new Map()
  const findings = []
  const file = path.resolve(workdir, taskFile)
  const finding = (rule, message, full = file, line = 0) => ({
    file: path.relative(workdir, full),
    line,
    rule: `harness/${rule}`,
    message,
  })

  function load(full) {
    if (modules.has(full)) return modules.get(full)
    const source = fs.readFileSync(full, "utf-8")
    const vue = /\.vue$/i.test(full)
    const module = {
      file: full,
      vue,
      imports: [],
      reexports: [],
      bindings: new Map(),
      exports: new Map(),
      stars: [],
    }
    modules.set(full, module)
    // An SFC is one component: its default export is implicit.
    if (vue) module.exports.set("default", { sfc: true })

    const blocks = vue ? scriptBlocks(source) : [source]
    for (const block of blocks) {
      if (!block.trim()) continue
      const parsed = parser.parseForESLint(block, {
        filePath: full,
        sourceType: "module",
        ecmaFeatures: { jsx: false },
        loc: true,
        range: true,
      })
      for (const statement of parsed.ast.body) {
        const declaration = statement.type.startsWith("Export")
          ? statement.declaration
          : statement
        if (declaration?.type === "VariableDeclaration") {
          for (const item of declaration.declarations) {
            if (item.id.type === "Identifier")
              module.bindings.set(item.id.name, { node: item.init })
          }
        } else if (declaration?.id?.name) {
          module.bindings.set(declaration.id.name, { node: declaration })
        }
        if (
          statement.type === "ImportDeclaration" &&
          statement.importKind !== "type"
        ) {
          module.imports.push(statement.source.value)
          for (const specifier of statement.specifiers) {
            if (specifier.importKind === "type") continue
            module.bindings.set(specifier.local.name, {
              source: statement.source.value,
              imported:
                specifier.type === "ImportDefaultSpecifier"
                  ? "default"
                  : specifier.type === "ImportNamespaceSpecifier"
                    ? "*"
                    : nameOf(specifier.imported),
            })
          }
        }
        if (statement.type === "ExportDefaultDeclaration") {
          module.exports.set("default", { node: statement.declaration })
        }
        if (
          statement.type === "ExportNamedDeclaration" &&
          statement.exportKind !== "type"
        ) {
          if (declaration?.id?.name)
            module.exports.set(declaration.id.name, {
              local: declaration.id.name,
            })
          for (const item of declaration?.declarations ?? []) {
            if (item.id.type === "Identifier")
              module.exports.set(item.id.name, { local: item.id.name })
          }
          for (const specifier of statement.specifiers) {
            if (specifier.exportKind === "type") continue
            module.exports.set(
              nameOf(specifier.exported),
              statement.source
                ? {
                    source: statement.source.value,
                    imported: nameOf(specifier.local),
                  }
                : { local: nameOf(specifier.local) }
            )
          }
          if (statement.source) module.reexports.push(statement.source.value)
        }
        if (
          statement.type === "ExportAllDeclaration" &&
          statement.exportKind !== "type" &&
          !statement.exported
        ) {
          module.stars.push(statement.source.value)
        }
      }
    }

    if (vue) {
      for (const { name, line } of unresolvedTags(source, module.bindings)) {
        findings.push(
          finding(
            "unresolved-component",
            `Component ${name} has no runtime definition or import.`,
            full,
            line
          )
        )
      }
    }
    return module
  }

  function imported(module, source, name, seen) {
    const target = resolveLocal(source, module.file, workdir)
    if (target) return exported(load(target), name, seen)
    // Package exports are checked by the resolver; their implementation
    // is outside the generated task's local source graph.
    return (
      !source.startsWith(".") &&
      !source.startsWith("@/") &&
      (name === "default" || /^[A-Z]/.test(name))
    )
  }

  function callable(module, binding, seen) {
    if (!binding) return false
    if (binding.sfc) return true
    if (binding.source)
      return imported(module, binding.source, binding.imported, seen)
    if (binding.local) return local(module, binding.local, seen)
    const node = binding.node
    if (!node) return false
    if (node.type === "Identifier") return local(module, node.name, seen)
    if (
      [
        "FunctionDeclaration",
        "FunctionExpression",
        "ArrowFunctionExpression",
      ].includes(node.type)
    )
      return true
    if (
      [
        "TSAsExpression",
        "TSSatisfiesExpression",
        "TSNonNullExpression",
        "TSTypeAssertion",
      ].includes(node.type)
    ) {
      return callable(module, { node: node.expression }, seen)
    }
    if (node.type === "CallExpression") {
      const callee = node.callee
      const binding = module.bindings.get(
        callee.type === "Identifier" ? callee.name : callee.object?.name
      )
      const factory =
        callee.type === "Identifier"
          ? binding?.imported
          : nameOf(callee.property)
      // defineComponent(function) and defineComponent({ setup, render }).
      if (
        binding?.source === "vue" &&
        factory === "defineComponent" &&
        (callee.type === "Identifier" ||
          ["default", "*"].includes(binding.imported))
      ) {
        const argument = node.arguments[0]
        if (
          [
            "FunctionDeclaration",
            "FunctionExpression",
            "ArrowFunctionExpression",
          ].includes(argument?.type)
        )
          return true
        return (
          argument?.type === "ObjectExpression" &&
          argument.properties.some((member) =>
            ["setup", "render"].includes(nameOf(member.key))
          )
        )
      }
    }
    return false
  }

  function local(module, name, seen) {
    const key = `${module.file}:local:${name}`
    if (seen.has(key)) return false
    return callable(module, module.bindings.get(name), new Set([...seen, key]))
  }

  function exported(module, name, seen = new Set()) {
    const key = `${module.file}:export:${name}`
    if (seen.has(key)) return false
    seen = new Set([...seen, key])
    if (module.exports.has(name))
      return callable(module, module.exports.get(name), seen)
    return (
      name !== "default" &&
      module.stars.some((source) => imported(module, source, name, seen))
    )
  }

  function exportNames(module, seen = new Set()) {
    if (seen.has(module.file)) return []
    seen.add(module.file)
    const names = [...module.exports.keys()]
    for (const source of module.stars) {
      const target = resolveLocal(source, module.file, workdir)
      if (target)
        names.push(
          ...exportNames(load(target), seen).filter(
            (name) => name !== "default"
          )
        )
    }
    return names
  }

  let exportName
  try {
    const module = load(file)
    exportName = [
      "default",
      ...exportNames(module).filter((name) => /^[A-Z]/.test(name)),
    ].find((name) => exported(module, name))

    // Every local import in the graph must resolve to a real file; the
    // bundler check this replaces is what caught broken imports before.
    // Barrels resolve as a whole, so re-export and star edges are part
    // of the graph: a broken file behind an index.ts is still broken.
    const checked = new Set([file])
    for (const current of checked) {
      const module = modules.get(current)
      const sources = [...module.imports, ...module.reexports, ...module.stars]
      for (const source of sources) {
        if (!source.startsWith(".") && !source.startsWith("@/")) continue
        const target = resolveLocal(source, module.file, workdir)
        if (!target) {
          findings.push(
            finding(
              "build-error",
              `Could not resolve "${source}".`,
              module.file
            )
          )
          continue
        }
        if (!checked.has(target)) {
          checked.add(target)
          load(target)
        }
      }
    }
  } catch (error) {
    return { findings: [finding("parse-error", error.message)] }
  }
  if (!exportName)
    findings.push(finding("no-export", `${taskFile} exports no component.`))
  return { exportName, findings }
}
