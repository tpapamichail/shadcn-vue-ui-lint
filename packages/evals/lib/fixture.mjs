// A fixture describes its layout in eval.json when it is not shadcn's:
// where the design-system components live, how their imports are
// recognized, and how the prompt introduces the project. Without the
// file the shadcn defaults apply, so existing fixtures are unchanged.

import * as fs from "node:fs"
import * as path from "node:path"

export const DEFAULT_MANIFEST = {
  intro: "a shadcn/ui project",
  componentsDir: "components/ui",
  // A componentImports entry for the rules; null means the
  // plugin's own discovery (components.json or the ui directory).
  importPattern: null,
}

export function manifestFor(dir) {
  try {
    const json = JSON.parse(
      fs.readFileSync(path.join(dir, "eval.json"), "utf8")
    )
    return { ...DEFAULT_MANIFEST, ...json }
  } catch {
    return { ...DEFAULT_MANIFEST }
  }
}
