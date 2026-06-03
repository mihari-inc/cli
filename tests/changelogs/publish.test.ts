import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { publishChangelog } from "../../src/changelogs/core/publisher.ts";

const originalFetch = globalThis.fetch;

describe("publishChangelog", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to /changelogs on the Mihari API", async () => {
    const fetchMock = mock(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await publishChangelog({
      target: "api",
      url: "https://api.example.com/",
      token: "tok",
      payload: {
        version: "v1.0.0",
        previousVersion: null,
        date: "2026-04-22",
        markdown: "## v1.0.0\n",
        repository: null,
        commitCount: 0,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.example.com/changelogs");
    expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(call[1].method).toBe("POST");
  });

  it("throws on non-2xx response", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;

    await expect(
      publishChangelog({
        target: "webhook",
        url: "https://hook.example.com",
        payload: {
          version: "v1.0.0",
          previousVersion: null,
          date: "2026-04-22",
          markdown: "",
          repository: null,
          commitCount: 0,
        },
      }),
    ).rejects.toThrow(/500/);
  });
});
