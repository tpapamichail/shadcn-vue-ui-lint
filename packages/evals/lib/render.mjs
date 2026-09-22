// Renders a generated component to a screenshot: esbuild bundles the
// TSX (with the fixture's ui components and React), the Tailwind v4
// CLI compiles the theme CSS against the workdir, and Playwright
// screenshots the result.

import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import * as esbuild from "esbuild"

import { readComponent } from "./component.mjs"

// Mounts the component with or without sample children. A component
// that only renders its children (a bare Card slot set) collapses to a
// zero-width box on its own; the second attempt fills it.
export function entrySource(exportName, componentPath, withChildren) {
  const binding =
    exportName === "default"
      ? "PreviewComponent"
      : `{ ${exportName} as PreviewComponent }`
  const element = withChildren
    ? `<PreviewComponent>Preview content</PreviewComponent>`
    : `<PreviewComponent />`
  return `import * as React from "react"
import { createRoot } from "react-dom/client"
import ${binding} from "${componentPath.replace(/\.tsx$/, "")}"

createRoot(document.getElementById("root")).render(
  <div style={{ padding: 40, display: "grid", placeItems: "center", minHeight: "100vh" }}>
    ${element}
  </div>
)
`
}

// A component mounted with no children that still paints something
// tiny (an empty badge pill at 14x16) is as unjudgeable as a blank one,
// so the fallback threshold is the size of the smallest real subject.
const MIN_SUBJECT = { width: 24, height: 12 }

// Renders and returns the screenshot path plus whether the captured
// subject is large enough to judge; an empty mount is not a verdict.
export async function renderToScreenshot(options) {
  const judgeable = (shot) =>
    shot.width >= MIN_SUBJECT.width && shot.height >= MIN_SUBJECT.height
  const first = await renderAttempt({ ...options, withChildren: false })
  if (judgeable(first)) return { outPng: first.outPng, judgeable: true }
  const second = await renderAttempt({ ...options, withChildren: true })
  return { outPng: second.outPng, judgeable: judgeable(second) }
}

async function renderAttempt({ workdir, taskFile, outPng, withChildren }) {
  workdir = path.resolve(workdir)
  const previewDir = path.join(workdir, ".preview")
  fs.mkdirSync(previewDir, { recursive: true })

  const { exportName, findings } = await readComponent(workdir, taskFile)
  if (findings.length) {
    throw new Error(findings.map((finding) => finding.message).join("\n"))
  }

  // Entry that mounts the component on a padded stage.
  const entryPath = path.join(previewDir, "entry.tsx")
  const componentPath = path
    .relative(previewDir, path.join(workdir, taskFile))
    .replace(/\\/g, "/")
  fs.writeFileSync(
    entryPath,
    entrySource(exportName, componentPath, withChildren)
  )

  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    outfile: path.join(previewDir, "bundle.js"),
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": workdir },
    logLevel: "silent",
  })

  // Workdirs from runs that predate the fixture theme get it backfilled.
  const globalsPath = path.join(workdir, "app/globals.css")
  if (!fs.existsSync(globalsPath)) {
    fs.copyFileSync(
      new URL("../fixture/app/globals.css", import.meta.url),
      globalsPath
    )
  }

  // Tailwind v4 scans the workdir for classes; cwd matters.
  execFileSync(
    "npx",
    [
      "@tailwindcss/cli",
      "-i",
      path.join(workdir, "app/globals.css"),
      "-o",
      path.join(previewDir, "styles.css"),
    ],
    { cwd: workdir, stdio: "pipe" }
  )

  fs.writeFileSync(
    path.join(previewDir, "index.html"),
    `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="./styles.css"></head>
<body><div id="root"></div><script src="./bundle.js"></script></body>
</html>
`
  )

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 2,
    })
    await page.goto(`file://${path.join(previewDir, "index.html")}`)
    await page.waitForTimeout(300)
    // Crop to the rendered component (plus margin) so small subjects
    // like a lone badge stay legible to the judge.
    const box = await page
      .locator("#root > div > *")
      .first()
      .boundingBox()
      .catch(() => null)
    if (box && box.width > 0) {
      const pad = 32
      await page.screenshot({
        path: outPng,
        clip: {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
          width: Math.min(800, box.width + pad * 2),
          height: Math.min(600, box.height + pad * 2),
        },
      })
    } else {
      await page.screenshot({ path: outPng })
    }
    return { outPng, width: box?.width ?? 0, height: box?.height ?? 0 }
  } finally {
    await browser.close()
  }
}
