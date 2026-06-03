import { ChangelogError } from "../../shared/utils/errors.ts";
import { logger } from "../../shared/utils/logger.ts";
import type { PublishTarget } from "../../shared/core/config.ts";
import type { ChangelogPayload } from "./types.ts";

export interface PublishOptions {
  target: PublishTarget;
  url: string;
  token?: string;
  payload: ChangelogPayload;
}

export async function publishChangelog(opts: PublishOptions): Promise<void> {
  switch (opts.target) {
    case "api":
      return publishToApi(opts);
    case "webhook":
      return publishToWebhook(opts);
    case "discord":
      return publishToDiscord(opts);
  }
}

async function publishToApi(opts: PublishOptions): Promise<void> {
  // NOTE: l'endpoint Mihari n'existe pas encore côté API.
  // Le contrat ci-dessous est la proposition client ; à figer quand l'API sera spécifiée.
  const endpoint = `${opts.url.replace(/\/$/, "")}/changelogs`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify(opts.payload),
  });
  if (!res.ok) {
    throw new ChangelogError(
      `Mihari API ${endpoint} returned ${res.status}: ${await res.text()}`,
    );
  }
  logger.success(`Posted ${opts.payload.version} to Mihari API`);
}

async function publishToWebhook(opts: PublishOptions): Promise<void> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts.payload),
  });
  if (!res.ok) {
    throw new ChangelogError(`Webhook returned ${res.status}: ${await res.text()}`);
  }
  logger.success(`Posted ${opts.payload.version} to webhook`);
}

async function publishToDiscord(opts: PublishOptions): Promise<void> {
  const { version, markdown, repository } = opts.payload;
  const body = markdown.length > 1800 ? `${markdown.slice(0, 1800)}\n…` : markdown;
  const content = [
    `**Release ${version}**${repository ? ` — \`${repository}\`` : ""}`,
    "",
    body,
  ].join("\n");

  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new ChangelogError(`Discord webhook returned ${res.status}: ${await res.text()}`);
  }
  logger.success(`Posted ${version} to Discord`);
}
