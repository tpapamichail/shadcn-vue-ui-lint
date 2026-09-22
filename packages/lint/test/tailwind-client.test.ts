// The synchronous bridge to the Tailwind worker: which timeout a
// question gets, and how many transport failures the process tolerates.
// Needs the built worker (pnpm build); skipped without it.

import * as path from "node:path"
import { afterEach, describe, expect, test } from "vitest"

import {
  failOracleTransportForTests,
  oracleAvailable,
  oracleStateForTests,
  resetOracleMemo,
  stopOracleForTests,
  unknownClasses,
} from "../src/tailwind/client"
import { PROJECT } from "./helpers"

const CSS = path.join(PROJECT, "app/globals.css")

describe.skipIf(!oracleAvailable())("tailwind worker bridge", () => {
  afterEach(() => {
    resetOracleMemo()
    stopOracleForTests()
  })

  test("the first question after every start gets the long timeout", () => {
    stopOracleForTests()
    const cold = oracleStateForTests().nextTimeout
    expect(unknownClasses(CSS, ["flex"])).toEqual([])
    const warm = oracleStateForTests().nextTimeout
    expect(warm).toBeLessThan(cold)
    // A deliberate restart (a theme with @plugin) or one after a crash
    // starts cold again.
    stopOracleForTests()
    expect(oracleStateForTests().nextTimeout).toBe(cold)
    expect(unknownClasses(CSS, ["flex"])).toEqual([])
    expect(oracleStateForTests().nextTimeout).toBe(warm)
  })

  test("a successful answer resets the restart budget", () => {
    failOracleTransportForTests()
    expect(oracleStateForTests().restarts).toBe(1)
    expect(oracleAvailable()).toBe(true)
    resetOracleMemo()
    expect(unknownClasses(CSS, ["flex"])).toEqual([])
    expect(oracleStateForTests().restarts).toBe(0)
    // One failure after a healthy stretch does not turn the oracle off.
    failOracleTransportForTests()
    expect(oracleAvailable()).toBe(true)
  })
})
