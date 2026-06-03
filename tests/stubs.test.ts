import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { main } from "../src/index.ts";

const bin = join(import.meta.dir, "..", "bin", "mihari.ts");

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; status: number }> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", bin, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, status };
}

describe("scaffold stubs", () => {
  it("registers uptime and telemetry as top-level sub-commands", () => {
    const subs = (main as { subCommands?: Record<string, unknown> }).subCommands;
    expect(subs).toBeDefined();
    expect(Object.keys(subs!)).toContain("uptime");
    expect(Object.keys(subs!)).toContain("telemetry");
  });

  it("uptime monitor list exits 2 with a coming-soon message", async () => {
    const { stderr, status } = await runCli(["uptime", "monitor", "list"]);
    expect(status).toBe(2);
    expect(stderr).toContain("GET /v1/uptime/monitors");
  });

  it("telemetry sources list exits 2", async () => {
    const { status } = await runCli(["telemetry", "sources", "list"]);
    expect(status).toBe(2);
  });
});
