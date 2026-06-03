import { createInterface } from "node:readline/promises";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/**
 * Minimal stdin-based selector. No external dependency. Falls back to
 * `defaultValue` when stdin isn't a TTY (CI, piped input) so scripts keep
 * working without having to pass every flag explicitly.
 */
export async function selectOption<T extends string>(
  message: string,
  options: SelectOption<T>[],
  defaultValue?: T,
): Promise<T> {
  if (!process.stdin.isTTY) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(
      `Cannot prompt "${message}" — stdin is not a TTY and no default was provided.`,
    );
  }

  process.stdout.write(`${message}\n`);
  options.forEach((opt, index) => {
    const marker = opt.value === defaultValue ? ">" : " ";
    const line = `${marker} ${index + 1}. ${opt.label}${opt.description ? ` — ${opt.description}` : ""}\n`;
    process.stdout.write(line);
  });
  const suffix = defaultValue !== undefined ? ` (default: ${defaultValue})` : "";
  process.stdout.write(`Select [1-${options.length}]${suffix}: `);

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  try {
    const answer = (await rl.question("")).trim();
    if (answer === "" && defaultValue !== undefined) return defaultValue;

    const asNumber = Number(answer);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
      return options[asNumber - 1]!.value;
    }

    const byValue = options.find((o) => o.value === answer);
    if (byValue) return byValue.value;

    throw new Error(`Invalid selection: "${answer}"`);
  } finally {
    rl.close();
  }
}
