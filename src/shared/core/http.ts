import type { AuthConfig } from "../context/config.ts";

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  contentType: string;
  body: string;
}

export type Fetcher = typeof fetch;

/**
 * Minimal HTTP sender used by the `api call` command. Injectable fetcher so
 * tests can run without network access.
 */
export async function sendHttpRequest(
  request: HttpRequest,
  fetcher: Fetcher = fetch,
): Promise<HttpResponse> {
  const response = await fetcher(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body !== undefined ? { body: request.body } : {}),
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    status: response.status,
    headers,
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}

/**
 * Applies the current context's auth config to the outgoing request. Query
 * parameters are mutated in place via URLSearchParams; headers are assigned
 * directly on the map.
 */
export function applyAuth(
  auth: AuthConfig | undefined,
  headers: Record<string, string>,
  query: URLSearchParams,
): void {
  if (!auth || auth.type === "none") return;
  if (auth.type === "bearer") {
    headers.Authorization = `Bearer ${auth.token}`;
    return;
  }
  if (auth.type === "basic") {
    const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString(
      "base64",
    );
    headers.Authorization = `Basic ${encoded}`;
    return;
  }
  if (auth.type === "apiKey") {
    if (auth.in === "header") headers[auth.name] = auth.value;
    else if (auth.in === "query") query.set(auth.name, auth.value);
    else if (auth.in === "cookie") {
      const existing = headers.Cookie;
      const cookie = `${auth.name}=${auth.value}`;
      headers.Cookie = existing ? `${existing}; ${cookie}` : cookie;
    }
  }
}
