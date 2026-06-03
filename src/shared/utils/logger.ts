import pc from "picocolors";

function tag(color: (s: string) => string, label: string): string {
  return color(`[${label}]`);
}

export const logger = {
  info: (msg: string) => console.log(tag(pc.blue, "info"), msg),
  success: (msg: string) => console.log(tag(pc.green, "ok"), msg),
  warn: (msg: string) => console.warn(tag(pc.yellow, "warn"), msg),
  error: (msg: string) => console.error(tag(pc.red, "error"), msg),
  debug: (msg: string) => {
    if (process.env.MIHARI_DEBUG) console.log(tag(pc.gray, "debug"), pc.gray(msg));
  },
};
