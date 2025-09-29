import { Logger } from "../types.js";

// Lightweight ANSI color helper
const ANSI_COLORS = {
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
} as const;

type ColorName = keyof typeof ANSI_COLORS;

const supportsAnsiColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function colorize(text: string, color: ColorName, options: { bold?: boolean } = {}): string {
  if (!supportsAnsiColor) {
    return text;
  }

  const boldCode = options.bold ? "\x1b[1m" : "";
  return `${boldCode}${ANSI_COLORS[color]}${text}\x1b[0m`;
}

export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(colorize(message, "cyan"));
  }

  warn(message: string): void {
    console.warn(colorize(message, "yellow"));
  }

  error(message: string): void {
    console.error(colorize(message, "red"));
  }

  success(message: string): void {
    console.log(colorize(message, "green"));
  }
}

export class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
  success(): void {}
}

export { colorize, ColorName };