import { logger } from "./logger.ts";

/**
 * Shared helper for command skeletons that are not yet wired to the Mihari API.
 * Prints a clear "coming soon" message and exits with a distinct code so CI
 * never mistakes a stub for a passing command.
 */
export function notYetWired(endpoint: string, description: string): never {
  logger.warn(`${endpoint} — ${description}`);
  logger.info(
    "The Mihari server contract for this endpoint is not defined yet. " +
      "Command skeleton is in place; the HTTP client will land once the API is specified.",
  );
  process.exit(2);
}
