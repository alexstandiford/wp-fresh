export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

const fmt = (meta?: Record<string, unknown>) =>
  meta && Object.keys(meta).length > 0 ? " " + JSON.stringify(meta) : "";

export const consoleLogger: Logger = {
  info(msg, meta) {
    process.stderr.write(`[wpfresh] ${msg}${fmt(meta)}\n`);
  },
  warn(msg, meta) {
    process.stderr.write(`[wpfresh:warn] ${msg}${fmt(meta)}\n`);
  },
  error(msg, meta) {
    process.stderr.write(`[wpfresh:error] ${msg}${fmt(meta)}\n`);
  },
  debug(msg, meta) {
    if (process.env.WPFRESH_DEBUG) {
      process.stderr.write(`[wpfresh:debug] ${msg}${fmt(meta)}\n`);
    }
  },
};

export const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};
