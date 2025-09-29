import { ModelChoice, ModelPricing, OutputFormatDefinition } from "./types.js";

// Valid model choices
export const VALID_MODELS: ModelChoice[] = ["gemini-2.5-pro", "gemini-flash-latest"];

// Supported audio file extensions
export const SUPPORTED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".ogg"];

// Output format definitions
export const OUTPUT_FORMATS: OutputFormatDefinition[] = [
  {
    id: "md",
    label: "Markdown",
    extension: ".md",
    description: "Lightweight report with structured headings and transcript",
  },
  {
    id: "docx",
    label: "Word (.docx)",
    extension: ".docx",
    description: "Office-ready document with styled sections",
  },
  {
    id: "pdf",
    label: "PDF",
    extension: ".pdf",
    description: "Print-friendly format with consistent layout",
  },
];

// Model API mapping
export const MODEL_API_MAPPING: { [key in ModelChoice]: string } = {
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-flash-latest": "gemini-flash-latest",
};

// Pricing configuration
export const PRICING_REFERENCE_URL = "https://ai.google.dev/gemini-api/docs/pricing";

export const MODEL_PRICING: Record<ModelChoice, ModelPricing> = {
  "gemini-2.5-pro": {
    inputPerMillion: 1.25,
    outputPerMillion: 10,
    assumption: "Standard tier, prompts ≤ 200k tokens.",
  },
  "gemini-flash-latest": {
    inputPerMillion: 1.0,
    outputPerMillion: 2.5,
    assumption: "Gemini 2.5 Flash standard tier, audio input pricing.",
  },
};

// MIME type mappings
export const MIME_TYPE_MAPPING: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

// PDF styling constants
export const PDF_STYLES = {
  margins: {
    default: 56,
  },
  colors: {
    heading: "#111827",
    text: "#1F2933",
    subtitle: "#4B5563",
    divider: "#CBD5E1",
  },
  fontSizes: {
    title: 22,
    subtitle: 12,
    sectionHeading: 14,
    metadataLabel: 9,
    metadataValue: 12,
    transcript: 11,
    footer: 9,
  },
  spacing: {
    titleAfter: 0.35,
    subtitleAfter: 0.8,
    sectionHeadingAfter: 0.45,
    metadataGap: 8,
    paragraphGap: 0.4,
    dividerAfter: 0.75,
    transcriptLineGap: 4,
    transcriptParagraphGap: 0.35,
  },
  lineWidth: {
    divider: 0.5,
  },
} as const;

// DOCX styling constants
export const DOCX_STYLES = {
  fonts: {
    default: "Calibri",
  },
  fontSizes: {
    body: 22, // 11pt in half-points
    heading: 28, // 14pt in half-points
    title: 40, // 20pt in half-points
    subtitle: 24, // 12pt in half-points
    metadataLabel: 18, // 9pt in half-points
    footer: 18, // 9pt in half-points
  },
  colors: {
    text: "1F2933", // Dark gray for body text
    heading: "111827", // Near-black for headings
    subtitle: "4B5563", // Medium gray for subtitles
    speaker: "1E40AF", // Blue for speaker labels
    metadataLabel: "6B7280", // Light gray for metadata labels
    divider: "CBD5E1", // Very light gray for divider lines
  },
  spacing: {
    small: 160,
    medium: 240,
    large: 320,
    extraLarge: 360,
    transcriptLine: 120, // Space after each transcript line
    transcriptLineHeight: 280, // Line height within transcript paragraphs
    transcriptParagraph: 240, // Space between transcript paragraphs (empty lines)
  },
  margins: {
    page: 720, // 0.5 inch margins (720 twips = 0.5 inch)
  },
} as const;

// File upload thresholds (in bytes)
export const INLINE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15MB raw size keeps base64 under ~20MB cap
export const MAX_AUDIO_FILE_SIZE = 500 * 1024 * 1024; // 500MB overall safeguard

// Input validation limits
export const INPUT_VALIDATION = {
  maxSpeakerLabelLength: 100,
  maxSpeakerDescriptionLength: 500,
  maxSpeakers: 20,
  minSpeakers: 1,
} as const;

// API configuration
export const API_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 300000, // 5 minutes
} as const;

// Files API polling configuration
export const FILES_API_CONFIG = {
  pollIntervalMs: 2000,
  maxPollAttempts: 60,
} as const;

// Directory configuration
export const DIRECTORIES = {
  audio: "audio",
  transcripts: "transcripts",
} as const;
