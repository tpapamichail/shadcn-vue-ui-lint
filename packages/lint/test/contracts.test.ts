// The contract engine. Nothing is allowed until config says so; the
// rule's top-level allow and deny are the policy for every component no
// contract names, and the last contract whose pattern matches a
// component is that component's whole policy, replacing the top-level
// one. Inside a policy, allow is the complete list of what may cross
// and deny subtracts from it.

import { describe, expect, test } from "vitest"

import { compileContracts } from "../src/rules/contracts"
import { noRestyle } from "../src/rules/no-restyle"
import { button, createTester, PAGE, sfc } from "./helpers"

const layout = { allow: ["layout"] }
const avatar = { pattern: "^Avatar$", allow: ["size-*"] }

describe("the top-level policy", () => {
  test("a bare rule allows nothing, layout included", () => {
    const contracts = compileContracts([])
    expect(contracts.decide("Button", "w-full")).toEqual({
      kind: "not-allowed",
      entries: [],
      category: "layout",
      message: null,
    })
    expect(contracts.decide("Button", "text-lg")).toMatchObject({
      kind: "not-allowed",
      entries: [],
      category: "typography",
    })
  })

  test("allow opens a set for every component no contract names", () => {
    const contracts = compileContracts([], layout)
    expect(contracts.decide("Button", "w-full")).toEqual({ kind: "ok" })
    expect(contracts.decide("Avatar", "size-8")).toEqual({ kind: "ok" })
    expect(contracts.decide("Button", "text-lg")).toEqual({
      kind: "not-allowed",
      entries: ["layout"],
      category: "typography",
      message: null,
    })
  })

  test("deny subtracts from it and has no words of its own", () => {
    const contracts = compileContracts([], { allow: ["layout"], deny: ["m"] })
    expect(contracts.decide("Button", "m-4")).toEqual({
      kind: "denied",
      entries: ["m"],
      category: "layout",
      message: null,
    })
    expect(contracts.decide("Button", "mt-4")).toEqual({ kind: "ok" })
  })
})

describe("contract selection", () => {
  test("a contract is the whole policy for the components it names", () => {
    const contracts = compileContracts([avatar], layout)
    expect(contracts.decide("Avatar", "size-8")).toEqual({ kind: "ok" })
    expect(contracts.decide("Avatar", "w-full")).toEqual({
      kind: "not-allowed",
      entries: ["size-*"],
      category: "layout",
      message: null,
    })
    // Components the contract does not name keep the top-level policy.
    expect(contracts.decide("Button", "w-full")).toEqual({ kind: "ok" })
  })

  test("the last matching contract wins", () => {
    const broad = { pattern: ".*", allow: ["layout"] }
    expect(
      compileContracts([broad, avatar]).decide("Avatar", "w-full")
    ).toMatchObject({ kind: "not-allowed", entries: ["size-*"] })
    expect(
      compileContracts([avatar, broad]).decide("Avatar", "w-full")
    ).toEqual({ kind: "ok" })
    expect(
      compileContracts([avatar, broad]).decide("Avatar", "text-lg")
    ).toMatchObject({ kind: "not-allowed", entries: ["layout"] })
  })

  test("a contract overrides the keys it writes and inherits the rest", () => {
    const contracts = compileContracts(
      [{ pattern: "^Button$", allow: ["layout", "spacing"] }],
      { allow: ["layout"], deny: ["m"] }
    )
    // Button wrote allow, so its list replaces the top-level one; it did
    // not write deny, so the margin deny still reaches it.
    expect(contracts.decide("Button", "m-4")).toMatchObject({
      kind: "denied",
      entries: ["m"],
    })
    expect(contracts.decide("Button", "p-4")).toEqual({ kind: "ok" })
    expect(contracts.decide("Card", "p-4")).toMatchObject({
      kind: "not-allowed",
      entries: ["layout"],
    })
    // Writing deny: [] on the contract lifts the inherited deny.
    const lifted = compileContracts(
      [{ pattern: "^Button$", allow: ["layout"], deny: [] }],
      { allow: ["layout"], deny: ["m"] }
    )
    expect(lifted.decide("Button", "m-4")).toEqual({ kind: "ok" })
    expect(lifted.decide("Card", "m-4").kind).toBe("denied")
  })

  test("a written empty deny is a denylist of nothing", () => {
    const contracts = compileContracts([], { deny: [] })
    for (const token of ["w-full", "bg-primary", "p-4"]) {
      expect(contracts.decide("Button", token)).toEqual({ kind: "ok" })
    }
    // An empty allow still closes everything.
    expect(
      compileContracts([], { allow: [] }).decide("Button", "w-full").kind
    ).toBe("not-allowed")
  })

  test("entries are matched the way tokens are", () => {
    const contracts = compileContracts([], {
      allow: ["-mt-4", "!p-4", "bg-amber-500/50"],
    })
    for (const token of [
      "mt-4",
      "-mt-4",
      "p-4",
      "!p-4",
      "md:p-4",
      "bg-amber-500",
      "bg-amber-500/20",
    ]) {
      expect(contracts.decide("Button", token)).toEqual({ kind: "ok" })
    }
    expect(contracts.decide("Button", "mt-2").kind).toBe("not-allowed")
  })

  test("the top-level message is the fallback for a contract without words", () => {
    const contracts = compileContracts(
      [
        { pattern: "^Button$", allow: ["layout"] },
        {
          pattern: "^Card$",
          allow: ["layout"],
          message: { color: "Card color." },
        },
      ],
      {
        allow: ["layout"],
        message: { default: "Top words.", spacing: "Top spacing." },
      }
    )
    expect(contracts.decide("Button", "bg-red-500")).toMatchObject({
      message: "Top words.",
    })
    expect(contracts.decide("Button", "p-4")).toMatchObject({
      message: "Top spacing.",
    })
    expect(contracts.decide("Card", "bg-red-500")).toMatchObject({
      message: "Card color.",
    })
    expect(contracts.decide("Card", "p-4")).toMatchObject({
      message: "Top spacing.",
    })
  })

  test("earlier contracts do not merge into the selected one", () => {
    const contracts = compileContracts(
      [
        { pattern: "^Avatar$", allow: ["layout", "typography"] },
        { pattern: ".*", allow: ["layout"], deny: ["w"] },
        avatar,
      ],
      layout
    )
    for (const token of ["w-full", "text-lg"]) {
      expect(contracts.decide("Avatar", token)).toMatchObject({
        kind: "not-allowed",
        entries: ["size-*"],
      })
    }
  })
})

describe("inside a contract", () => {
  test("deny subtracts from allow", () => {
    const contracts = compileContracts(
      [{ pattern: "^Button$", allow: ["layout"], deny: ["w-*", "size-*"] }],
      layout
    )
    expect(contracts.decide("Button", "w-full")).toEqual({
      kind: "denied",
      entries: ["w-*", "size-*"],
      category: "layout",
      message: null,
    })
    expect(contracts.decide("Button", "md:size-8")).toMatchObject({
      kind: "denied",
    })
    expect(contracts.decide("Button", "mt-4")).toEqual({ kind: "ok" })
    expect(contracts.decide("Button", "text-lg")).toMatchObject({
      kind: "not-allowed",
      entries: ["layout"],
      category: "typography",
    })
  })

  test("a contract without allow keeps the top-level list", () => {
    // Words only: the verdict is the top-level policy's, the words are
    // the contract's.
    const words = compileContracts(
      [{ pattern: "^Badge$", message: "A Badge is one of its variants." }],
      layout
    )
    expect(words.decide("Badge", "w-full")).toEqual({ kind: "ok" })
    for (const [token, category] of [
      ["p-2", "spacing"],
      ["bg-red-500", "color"],
    ]) {
      expect(words.decide("Badge", token)).toEqual({
        kind: "not-allowed",
        entries: ["layout"],
        category,
        message: "A Badge is one of its variants.",
      })
    }
    // deny only: the top-level list minus these.
    const minus = compileContracts(
      [{ pattern: "^Button$", deny: ["w-*"] }],
      layout
    )
    expect(minus.decide("Button", "w-full").kind).toBe("denied")
    expect(minus.decide("Button", "mt-4")).toEqual({ kind: "ok" })
    expect(minus.decide("Button", "text-lg").kind).toBe("not-allowed")
  })

  test("a later contract without allow reopens what an earlier one closed", () => {
    const contracts = compileContracts(
      [avatar, { pattern: "^Avatar$", message: "Later." }],
      layout
    )
    expect(contracts.decide("Avatar", "w-full")).toEqual({ kind: "ok" })
    expect(contracts.decide("Avatar", "text-lg")).toEqual({
      kind: "not-allowed",
      entries: ["layout"],
      category: "typography",
      message: "Later.",
    })
  })

  test("a top-level deny alone is a denylist", () => {
    const contracts = compileContracts([], { deny: ["w-*"] })
    expect(contracts.decide("Button", "w-full").kind).toBe("denied")
    for (const token of ["mt-4", "text-lg", "bg-red-500"]) {
      expect(contracts.decide("Button", token)).toEqual({ kind: "ok" })
    }
  })

  test("the deciding contract's words, by category with a default", () => {
    const contracts = compileContracts(
      [
        {
          ...avatar,
          deny: ["size-full"],
          message: { layout: "Size only.", default: "Fallback." },
        },
      ],
      layout
    )
    expect(contracts.decide("Avatar", "w-full")).toEqual({
      kind: "not-allowed",
      entries: ["size-*"],
      category: "layout",
      message: "Size only.",
    })
    expect(contracts.decide("Avatar", "size-full")).toEqual({
      kind: "denied",
      entries: ["size-full"],
      category: "layout",
      message: "Size only.",
    })
    expect(contracts.decide("Avatar", "text-lg")).toMatchObject({
      kind: "not-allowed",
      entries: ["size-*"],
      message: "Fallback.",
    })
  })

  test("an explicit arbitrary-property entry matches the bare property only", () => {
    const contracts = compileContracts(
      [{ pattern: ".*", allow: ["layout"], deny: ["[margin:*]"] }],
      { fromFile: PAGE }
    )
    expect(contracts.decide("Button", "[margin:1rem]")).toMatchObject({
      kind: "denied",
      entries: ["[margin:*]"],
    })
    // An entry with ":" matches the full class, so a variant or an
    // important marker on it is a different class.
    for (const token of ["md:[margin:1rem]", "[margin:1rem]!", "mt-4"]) {
      expect(contracts.decide("Button", token)).toEqual({ kind: "ok" })
    }
  })
})

test("layout and denied diagnostics name the policy's list", () => {
  createTester().run("no-restyle", noRestyle as any, {
    valid: [
      {
        filename: PAGE,
        code: sfc(button, `<Button class="mt-4 w-full">Go</Button>`),
        options: [layout],
      },
    ],
    invalid: [
      // A bare rule reports a layout class and says how to open layout.
      {
        filename: PAGE,
        code: sfc(button, `<Button class="mt-4">Go</Button>`),
        errors: [
          {
            message:
              '"mt-4" is not allowed on <Button>: its contract allows no classes. Put layout classes on a parent element instead.',
          },
        ],
      },
      {
        filename: PAGE,
        code: sfc(button, `<Button class="w-full">Go</Button>`),
        options: [
          {
            ...layout,
            contracts: [{ pattern: "^Button$", allow: ["size-*"] }],
          },
        ],
        errors: [
          {
            message:
              '"w-full" is not allowed on <Button>: its contract allows size-*. Use one of those, or put layout classes on a parent element.',
          },
        ],
      },
      {
        filename: PAGE,
        code: sfc(button, `<Button class="w-full">Go</Button>`),
        options: [
          {
            ...layout,
            contracts: [
              { pattern: "^Button$", allow: ["layout"], deny: ["w-*"] },
            ],
          },
        ],
        errors: [
          {
            message:
              '"w-full" is not allowed on <Button>: its contract denies w-*.',
          },
        ],
      },
      // A contract's own words see the raw list, so an empty one takes
      // the author's fallback, not the rule's.
      {
        filename: PAGE,
        code: sfc(button, `<Button class="w-full">Go</Button>`),
        options: [
          {
            ...layout,
            contracts: [
              {
                pattern: "^Button$",
                allow: [],
                message:
                  "No classes on {{component}}. Entries: {{entries|none}}.",
              },
            ],
          },
        ],
        errors: [{ message: "No classes on Button. Entries: none." }],
      },
    ],
  })
})

test("the rule's own message speaks for the top-level policy", () => {
  createTester().run("no-restyle", noRestyle as any, {
    valid: [],
    invalid: [
      // One string covers every finding the top-level policy decides.
      {
        filename: PAGE,
        code: sfc(button, `<Button class="mt-4 bg-red-500">Go</Button>`),
        options: [{ message: "nope cannot use {{className}}" }],
        errors: [
          { message: "nope cannot use mt-4" },
          { message: "nope cannot use bg-red-500" },
        ],
      },
      // A category table, and a contract's own words still win for the
      // components it names.
      {
        filename: PAGE,
        code: sfc(
          `${button}\nimport { Card } from "@/components/ui/card"`,
          `<Button class="p-6">Go</Button>\n<Card class="p-6">Hi</Card>`
        ),
        options: [
          {
            allow: ["layout"],
            message: { spacing: "Space is the page's, not <{{component}}>'s." },
            contracts: [
              { pattern: "^Card$", allow: ["layout"], message: "Card words." },
            ],
          },
        ],
        errors: [
          { message: "Space is the page's, not <Button>'s." },
          { message: "Card words." },
        ],
      },
    ],
  })
})

describe("unclassified names", () => {
  test("are not layout; markers and named classes are", () => {
    const contracts = compileContracts([], { allow: ["layout"] })
    expect(contracts.decide("Button", "flex-cols")).toMatchObject({
      kind: "not-allowed",
      category: "unclassified",
    })
    expect(contracts.decide("Button", "tap-target")).toMatchObject({
      kind: "not-allowed",
      category: "unclassified",
    })
    // Tailwind's markers style nothing and count as layout.
    for (const token of [
      "group",
      "group/collapsible",
      "peer",
      "peer/x",
      "dark",
    ]) {
      expect(contracts.decide("Button", token)).toEqual({ kind: "ok" })
    }
    // A project's own class is allowed by name.
    const named = compileContracts([], { allow: ["layout", "tap-target"] })
    expect(named.decide("Button", "tap-target")).toEqual({ kind: "ok" })
    expect(named.decide("Button", "flex-cols").kind).toBe("not-allowed")
  })

  test("get their own words in the rule", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="flex-cols">Go</Button>`),
          options: [{ allow: ["layout"] }],
          errors: [
            {
              message:
                '"flex-cols" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates.',
            },
          ],
        },
      ],
    })
  })
})
