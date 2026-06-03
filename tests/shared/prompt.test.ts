import { describe, expect, it } from "bun:test";

import { selectOption } from "../../src/shared/utils/prompt.ts";

describe("selectOption", () => {
  it("returns the default when stdin is not a TTY", async () => {
    // `bun test` runs with piped stdin so isTTY is false.
    const value = await selectOption(
      "pick one",
      [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      "b",
    );
    expect(value).toBe("b");
  });

  it("throws when there is no default and stdin is not a TTY", async () => {
    await expect(
      selectOption("pick one", [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ]),
    ).rejects.toThrow(/TTY/);
  });
});
