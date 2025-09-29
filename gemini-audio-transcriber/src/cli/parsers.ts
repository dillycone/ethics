import { OutputFormat } from "../types.js";
import { OUTPUT_FORMATS } from "../config.js";

/**
 * Parses output format input from user
 */
export function parseOutputFormats(input?: string | null): OutputFormat[] {
  if (!input) {
    return [];
  }

  const normalized = input
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  const validFormats: OutputFormat[] = [];
  normalized.forEach((value) => {
    const numericIndex = Number.parseInt(value, 10);
    if (!Number.isNaN(numericIndex) && numericIndex >= 1 && numericIndex <= OUTPUT_FORMATS.length) {
      const format = OUTPUT_FORMATS[numericIndex - 1].id;
      if (!validFormats.includes(format)) {
        validFormats.push(format);
      }
      return;
    }

    const match = OUTPUT_FORMATS.find(
      (format) => format.id === value || format.label.toLowerCase() === value
    );
    if (match && !validFormats.includes(match.id)) {
      validFormats.push(match.id);
    }
  });

  return validFormats;
}