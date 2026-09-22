import { spawn } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

export function codexResult(stdout, code) {
  const events = stdout
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
  const completed = events.filter((event) => event.type === "turn.completed")
  return {
    costUsd: null,
    numTurns: completed.length,
    isError:
      code !== 0 ||
      completed.length === 0 ||
      events.some((event) => event.type === "turn.failed"),
    usage: completed.at(-1)?.usage ?? null,
  }
}

export async function runCodexAgent(workdir, prompt, { model, reasoning }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lint-eval-"))
  const evalCodexHome = fs.mkdtempSync(
    path.join(os.tmpdir(), "lint-eval-auth-")
  )
  const env = { ...process.env, CODEX_HOME: evalCodexHome }
  delete env.CODEX_THREAD_ID
  delete env.CODEX_SESSION_ID
  const started = Date.now()
  const log = `${path.basename(workdir)}-${started}.jsonl`
  const logPath = path.join(path.dirname(workdir), log)

  try {
    fs.cpSync(workdir, scratch, { recursive: true })
    fs.chmodSync(evalCodexHome, 0o700)
    fs.copyFileSync(
      path.join(
        process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
        "auth.json"
      ),
      path.join(evalCodexHome, "auth.json")
    )
    fs.chmodSync(path.join(evalCodexHome, "auth.json"), 0o600)
    fs.writeFileSync(logPath, "")
    fs.writeFileSync(`${logPath}.stderr`, "")
    const { stdout, stderr, code } = await new Promise((resolve) => {
      const child = spawn(
        process.env.CODEX_BIN || "codex",
        [
          "exec",
          "--ignore-user-config",
          "--ephemeral",
          "--skip-git-repo-check",
          "--sandbox",
          "workspace-write",
          "--model",
          model,
          "--config",
          'approval_policy="never"',
          "--config",
          `model_reasoning_effort=${JSON.stringify(reasoning)}`,
          "--config",
          "project_doc_max_bytes=0",
          "--config",
          "skills.include_instructions=false",
          "--config",
          "features.plugins=false",
          "--config",
          "features.apps=false",
          "--config",
          "features.multi_agent=false",
          "--config",
          "features.browser_use=false",
          "--config",
          "features.computer_use=false",
          "--config",
          'developer_instructions="Work only in the current project. Use shell commands only to list or read project files. Use apply_patch to edit files. Do not install dependencies, run builds or tests, start servers, use the network, or read outside the current project. In the task, no commands means no commands other than listing or reading project files."',
          "--json",
          "-",
        ],
        { cwd: scratch, env, stdio: ["pipe", "pipe", "pipe"] }
      )
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (data) => {
        stdout += data
        fs.appendFileSync(logPath, data)
      })
      child.stderr.on("data", (data) => {
        stderr += data
        fs.appendFileSync(`${logPath}.stderr`, data)
      })
      child.stdin.on("error", () => {})
      child.stdin.end(
        prompt.replace(
          "Do not install dependencies or run any commands.",
          "Use shell commands only to list or read project files, and apply_patch to edit files. Do not install dependencies, run builds or tests, or start servers."
        )
      )
      const timer = setTimeout(() => child.kill("SIGKILL"), 300_000)
      child.on("error", (error) => {
        clearTimeout(timer)
        resolve({ stdout, stderr: error.message, code: 1 })
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        resolve({ stdout, stderr, code })
      })
    })

    fs.rmSync(workdir, { recursive: true, force: true })
    fs.cpSync(scratch, workdir, { recursive: true })

    let meta
    try {
      meta = codexResult(stdout, code)
    } catch {
      meta = { costUsd: null, numTurns: null, isError: true, usage: null }
    }
    if (meta.isError) {
      console.error(`    agent error (exit ${code}): ${stderr.slice(-500)}`)
    }
    return {
      ...meta,
      provider: "codex",
      reasoning,
      durationMs: Date.now() - started,
      log,
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
    fs.rmSync(evalCodexHome, { recursive: true, force: true })
  }
}
