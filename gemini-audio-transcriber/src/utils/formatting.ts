import * as path from "path";

/**
 * Formats a currency value to a readable string
 */
export function toCurrency(value: number): string {
  if (Number.isNaN(value)) {
    return "$0.00";
  }

  const rounded = value < 0.01 ? value.toFixed(4) : value.toFixed(2);
  return `$${rounded}`;
}

/**
 * Formats a file path for display (relative to cwd if possible)
 */
export function formatDisplayPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  return relative || filePath;
}

/**
 * Generates a timestamp string for file naming
 */
export function generateTimestamp(date: Date): string {
  return date.toISOString().replace(/[:-]/g, "").slice(0, 15);
}

/**
 * Formats a number with locale-specific thousands separators.
 * Accepts undefined/null inputs because the Gemini API may omit usage counts.
 */
export function formatNumber(value: number | undefined | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0";
  }

  return value.toLocaleString();
}
