import { UsageMetadata } from "@google/generative-ai";

// Model configuration
export type ModelChoice = "gemini-2.5-pro" | "gemini-flash-latest";

export interface ModelPricing {
  /** Paid tier input price in USD per 1M tokens. */
  inputPerMillion: number;
  /** Paid tier output price in USD per 1M tokens. */
  outputPerMillion: number;
  /** Short note describing the assumption applied to this rate. */
  assumption: string;
}

// Speaker configuration
export interface SpeakerProfile {
  label: string;
  description?: string;
}

// Output formats
export type OutputFormat = "md" | "docx" | "pdf";

export interface OutputFormatDefinition {
  id: OutputFormat;
  label: string;
  extension: string;
  description: string;
}

// Report data structures
export interface ReportMetadataEntry {
  label: string;
  value: string;
}

export interface ReportData {
  title: string;
  subtitle: string;
  metadata: ReportMetadataEntry[];
  transcriptLines: string[];
}

export interface TranscriptionReportContext {
  audioFilePath: string;
  modelChoice: ModelChoice;
  speakers?: SpeakerProfile[];
  usageMetadata?: UsageMetadata;
}

export interface SaveTranscriptionReportArgs {
  transcription: string;
  formats: OutputFormat[];
  context: TranscriptionReportContext;
  uploads?: {
    s3?: S3UploadConfig;
  };
}

export interface TranscriptionResult {
  transcription: string;
  usageMetadata?: UsageMetadata;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  assumption: string;
}

export interface S3UploadConfig {
  bucket: string;
  prefix?: string;
  region?: string;
  acl?: "private" | "public-read";
  profile?: string;
}

// Logger interface for dependency injection
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
}

// File system interface for dependency injection
export interface FileSystem {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, content: Buffer | string): Promise<void>;
  createWriteStream(path: string): NodeJS.WritableStream;
  stat(path: string): Promise<{ isFile: () => boolean; size: number }>;
  readdir(path: string): Promise<Array<{ name: string; isFile: () => boolean }>>;
  mkdir(path: string, options?: { recursive: boolean }): Promise<void>;
}
