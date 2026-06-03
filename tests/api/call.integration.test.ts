import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { saveGlobalConfig } from "../../src/shared/context/config.ts";
import { refreshContextSpec } from "../../src/shared/context/store.ts";

// Use a temporary MIHARI_HOME for the whole test file so we never touch the
// real ~/.mihari.
const tmpHome = mkdtempSync(join(tmpdir(), "mihari-test-"));
process.env.MIHARI_HOME = tmpHome;

const fixtureSpec = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "oas",
  "tests",
  "fixtures",
  "oas",
  "petstore.yaml",
);

interface CapturedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: string;
}

let capturedRequests: CapturedRequest[] = [];
let server: ReturnType<typeof Bun.serve> | null = null;
let baseUrl = "";

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => {
        headers[k] = v;
      });
      capturedRequests.push({
        method: req.method,
        path: url.pathname,
        query: url.searchParams,
        headers,
        body: await req.text(),
      });
      if (url.pathname === "/api/v1/pets" && req.method === "GET") {
        return new Response(JSON.stringify([{ id: "p1", name: "Rex" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname.startsWith("/api/v1/pets/") && req.method === "GET") {
        const id = url.pathname.split("/").pop();
        return new Response(JSON.stringify({ id, name: "Rex" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/api/v1/pets" && req.method === "POST") {
        return new Response(null, { status: 201 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  baseUrl = `http://localhost:${server.port}/api/v1`;

  await saveGlobalConfig({
    currentContext: "petstore",
    contexts: {
      petstore: {
        spec: fixtureSpec,
        server: baseUrl,
        auth: { type: "bearer", token: "test-token" },
      },
    },
  });
  // Pre-cache the dereferenced spec so `api call` reuses it instantly.
  await refreshContextSpec("petstore", {
    spec: fixtureSpec,
    server: baseUrl,
    auth: { type: "bearer", token: "test-token" },
  });
});

afterAll(() => {
  if (server) server.stop(true);
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.MIHARI_HOME;
});

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; status: number }> {
  const bin = join(import.meta.dir, "..", "..", "bin", "mihari.ts");
  const proc = Bun.spawn({
    cmd: ["bun", "run", bin, ...args],
    env: { ...process.env, MIHARI_HOME: tmpHome },
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

describe("mihari api call", () => {
  beforeAll(() => {
    capturedRequests = [];
  });

  it("executes a GET with path parameters and bearer auth", async () => {
    capturedRequests = [];
    const { stdout, status } = await runCli([
      "api",
      "call",
      "getPet",
      "--param",
      "id=p1",
    ]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ id: "p1", name: "Rex" });
    expect(capturedRequests).toHaveLength(1);
    const captured = capturedRequests[0]!;
    expect(captured.method).toBe("GET");
    expect(captured.path).toBe("/api/v1/pets/p1");
    expect(captured.headers.authorization).toBe("Bearer test-token");
  });

  it("refuses a body-required call without --body", async () => {
    const { stderr, status } = await runCli(["api", "call", "createPet"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/request body/i);
  });

  it("POSTs a JSON body when provided", async () => {
    capturedRequests = [];
    const { status } = await runCli([
      "api",
      "call",
      "createPet",
      "--body",
      '{"name":"Milo"}',
    ]);
    expect(status).toBe(0);
    const captured = capturedRequests[0]!;
    expect(captured.method).toBe("POST");
    expect(captured.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(captured.body)).toEqual({ name: "Milo" });
  });

  it("supports --dry-run without making a request", async () => {
    capturedRequests = [];
    const { stdout, status } = await runCli([
      "api",
      "call",
      "listPets",
      "--param",
      "limit=5",
      "--dry-run",
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain("GET ");
    expect(stdout).toContain("limit=5");
    expect(capturedRequests).toHaveLength(0);
  });
});
