import * as path from "path";
import { FileSystem } from "../types.js";
import { SUPPORTED_AUDIO_EXTENSIONS, MAX_AUDIO_FILE_SIZE, INPUT_VALIDATION } from "../config.js";

/**
 * Sanitizes a string by removing/replacing dangerous characters
 */
export function sanitizeString(input: string, maxLength: number): string {
  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, "");

  // Normalize unicode
  sanitized = sanitized.normalize("NFC");

  // Trim and limit length
  sanitized = sanitized.trim().slice(0, maxLength);

  return sanitized;
}

/**
 * Escapes special characters for markdown
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/`/g, "\\`")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br />");
}

/**
 * Validates a speaker label
 */
export function validateSpeakerLabel(label: string): string | null {
  if (!label || label.trim().length === 0) {
    return "Speaker label cannot be empty";
  }

  if (label.length > INPUT_VALIDATION.maxSpeakerLabelLength) {
    return `Speaker label cannot exceed ${INPUT_VALIDATION.maxSpeakerLabelLength} characters`;
  }

  return null;
}

/**
 * Validates a speaker description
 */
export function validateSpeakerDescription(description: string): string | null {
  if (description.length > INPUT_VALIDATION.maxSpeakerDescriptionLength) {
    return `Speaker description cannot exceed ${INPUT_VALIDATION.maxSpeakerDescriptionLength} characters`;
  }

  return null;
}

/**
 * Validates speaker count
 */
export function validateSpeakerCount(count: number): string | null {
  if (count < INPUT_VALIDATION.minSpeakers) {
    return `Number of speakers must be at least ${INPUT_VALIDATION.minSpeakers}`;
  }

  if (count > INPUT_VALIDATION.maxSpeakers) {
    return `Number of speakers cannot exceed ${INPUT_VALIDATION.maxSpeakers}`;
  }

  return null;
}

/**
 * Checks whether the provided file path has a supported audio extension.
 */
export function isSupportedAudioFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.includes(extension);
}

/**
 * Validates an audio file path and size
 */
export async function validateAudioFile(
  filePath: string,
  fs: FileSystem
): Promise<string | null> {
  if (!filePath || filePath.trim().length === 0) {
    return "Please provide a file path.";
  }

  if (!isSupportedAudioFile(filePath)) {
    return `Unsupported file extension. Supported extensions: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}`;
  }

  try {
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      return `Path is not a file: ${filePath}`;
    }

    if (stats.size === 0) {
      return "Audio file is empty";
    }

    if (stats.size > MAX_AUDIO_FILE_SIZE) {
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      const maxSizeMB = (MAX_AUDIO_FILE_SIZE / (1024 * 1024)).toFixed(0);
      return `Audio file is too large (${sizeMB}MB). Maximum supported size is ${maxSizeMB}MB.`;
    }

    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return `File not found: ${filePath}`;
    }
    if ((error as NodeJS.ErrnoException).code === "EACCES") {
      return `Permission denied: ${filePath}`;
    }
    throw error;
  }
}
