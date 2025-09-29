import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import * as path from "path";
import { FileSystem, Logger, ModelChoice, SpeakerProfile, TranscriptionResult } from "../types.js";
import { MODEL_API_MAPPING, MIME_TYPE_MAPPING, API_CONFIG, INLINE_UPLOAD_MAX_BYTES } from "../config.js";
import { formatNumber } from "../utils/formatting.js";
import { uploadAudioFileViaFilesApi } from "./files.js";

/**
 * Converts a local file to a GoogleGenerativeAI.Part object using async I/O
 */
function resolveMimeType(filePath: string): string {
  const fileExtension = path.extname(filePath).toLowerCase();

  const mimeType = MIME_TYPE_MAPPING[fileExtension];
  if (!mimeType) {
    throw new Error(`Unsupported audio file type: ${fileExtension}`);
  }

  return mimeType;
}

async function fileToGenerativePart(
  filePath: string,
  fs: FileSystem,
  mimeType: string
): Promise<Part> {
  const fileBuffer = await fs.readFile(filePath);

  return {
    inlineData: {
      data: fileBuffer.toString("base64"),
      mimeType,
    },
  };
}

/**
 * Builds the transcription prompt with speaker information
 */
function buildTranscriptionPrompt(speakers?: SpeakerProfile[]): string {
  const lines: string[] = [
    "Please transcribe the audio file verbatim.",
    "Additionally, perform speaker diarization by identifying each speaker and labeling their turn.",
  ];

  if (speakers && speakers.length > 0) {
    lines.push("Use the following speaker labels when attributing dialogue:");
    speakers.forEach((speaker, index) => {
      const label = speaker.label || `Speaker ${index + 1}`;
      const descriptionSuffix = speaker.description ? ` - ${speaker.description}` : "";
      lines.push(`- ${label}${descriptionSuffix}`);
    });
  } else {
    lines.push('Use labels like "Speaker 1", "Speaker 2", etc.');
  }

  const resolvedLabels =
    speakers && speakers.length > 0
      ? speakers.map((speaker, index) => speaker.label || `Speaker ${index + 1}`)
      : [];
  const exampleSpeaker1 = resolvedLabels[0] ?? "Speaker 1";
  const exampleSpeaker2 = resolvedLabels[1] ?? "Speaker 2";

  lines.push(
    "Format each utterance on its own line as 'Label: dialogue'.",
    "",
    "Example Output:",
    `${exampleSpeaker1}: Hello, how are you today?`,
    `${exampleSpeaker2}: I'm doing well, thank you. How about you?`,
    `${exampleSpeaker1}: I'm great!`
  );

  return `${lines.join("\n")}\n`;
}

/**
 * Delays execution for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Retry on rate limits, timeouts, and temporary network errors
  return (
    errorMessage.includes("429") ||
    errorMessage.includes("503") ||
    errorMessage.includes("ECONNRESET") ||
    errorMessage.includes("ETIMEDOUT") ||
    errorMessage.includes("rate limit")
  );
}

/**
 * Transcribes and diarizes an audio file using the specified Gemini model with retry logic
 */
export async function transcribeAndDiarize(
  filePath: string,
  userModelChoice: ModelChoice,
  fs: FileSystem,
  logger: Logger,
  speakers?: SpeakerProfile[]
): Promise<TranscriptionResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set in the .env file.");
  }

  const apiModelName = MODEL_API_MAPPING[userModelChoice];

  logger.info(`\nProcessing '${path.basename(filePath)}' with model choice '${userModelChoice}'...`);

  if (userModelChoice !== apiModelName) {
    logger.warn(
      `NOTE: '${userModelChoice}' is served by '${apiModelName}' in the current API.`
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: apiModelName });

  if (speakers && speakers.length > 0) {
    logger.info("Using speaker labels:");
    speakers.forEach((profile, index) => {
      const descriptionSuffix = profile.description ? ` - ${profile.description}` : "";
      logger.info(`  ${index + 1}. ${profile.label}${descriptionSuffix}`);
    });
  }

  const prompt = buildTranscriptionPrompt(speakers);

  let lastError: unknown;

  const fileStats = await fs.stat(filePath);
  const mimeType = resolveMimeType(filePath);
  const useInlineUpload = fileStats.size <= INLINE_UPLOAD_MAX_BYTES;
  let fileUri: string | undefined;

  for (let attempt = 1; attempt <= API_CONFIG.maxRetries; attempt++) {
    try {
      logger.info(`Preparing audio file (attempt ${attempt}/${API_CONFIG.maxRetries})...`);

      if (!useInlineUpload && !fileUri) {
        fileUri = await uploadAudioFileViaFilesApi(filePath, mimeType, apiKey, logger);
        logger.info("Requesting transcription with Files API reference...");
      }

      const audioFilePart = useInlineUpload
        ? await fileToGenerativePart(filePath, fs, mimeType)
        : {
            fileData: {
              mimeType,
              fileUri: fileUri ?? (() => {
                throw new Error("Files API upload did not return a file URI.");
              })(),
            },
          };

      logger.info("Sending request to Gemini API...");
      const result = await model.generateContent([prompt, audioFilePart]);
      const response = result.response;
      const transcription = response.text() ?? "";

      if (!transcription || transcription.trim().length === 0) {
        throw new Error("API returned empty transcription");
      }

      logger.info("\n--- Transcription and Diarization Result ---");
      console.log(transcription);
      logger.info("------------------------------------------\n");

      const usageMetadata = response.usageMetadata;
      if (usageMetadata) {
        logger.info("Token usage:");
        logger.info(`  Prompt tokens: ${formatNumber(usageMetadata.promptTokenCount)}`);
        logger.info(`  Output tokens: ${formatNumber(usageMetadata.candidatesTokenCount)}`);
        logger.info(`  Total tokens: ${formatNumber(usageMetadata.totalTokenCount)}`);
      } else {
        logger.warn("Token usage metadata was not returned by the API.");
      }

      return { transcription, usageMetadata };
    } catch (error) {
      lastError = error;

      if (attempt < API_CONFIG.maxRetries && isRetryableError(error)) {
        const delayMs = API_CONFIG.retryDelayMs * attempt;
        logger.warn(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
        logger.warn(`Retrying in ${delayMs}ms... (attempt ${attempt}/${API_CONFIG.maxRetries})`);
        await delay(delayMs);
        continue;
      }

      break;
    }
  }

  throw new Error(
    `Failed to transcribe after ${API_CONFIG.maxRetries} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
