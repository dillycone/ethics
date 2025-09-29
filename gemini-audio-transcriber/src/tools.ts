/**
 * Custom MCP tools for the Gemini Audio Transcriber Agent
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-code';
import { z } from 'zod';
import * as path from 'path';
import { VALID_MODELS, OUTPUT_FORMATS, DIRECTORIES } from './config.js';
import { NodeFileSystem } from './utils/filesystem.js';
import { ConsoleLogger } from './utils/logger.js';
import { transcribeAndDiarize } from './api/gemini.js';
import { estimateCost } from './api/pricing.js';
import { saveTranscriptionReport } from './reports/index.js';
import { validateAudioFile, isSupportedAudioFile } from './utils/validation.js';
import { toCurrency } from './utils/formatting.js';
import type { ModelChoice, OutputFormat, SpeakerProfile, S3UploadConfig } from './types.js';

// Shared instances
const fs = new NodeFileSystem();
const logger = new ConsoleLogger();

// Storage for transcription results within a session
const sessionStorage = {
  lastTranscription: '' as string,
  lastUsageMetadata: undefined as any,
  lastFilePath: '' as string,
  lastModelChoice: '' as ModelChoice,
  lastSpeakers: undefined as SpeakerProfile[] | undefined,
};

/**
 * Helper to resolve S3 config from environment
 */
function resolveS3UploadConfig(): S3UploadConfig | undefined {
  const bucket = process.env.S3_UPLOAD_BUCKET;
  if (!bucket) {
    return undefined;
  }

  const region = process.env.S3_UPLOAD_REGION ?? process.env.AWS_REGION;
  const prefix = process.env.S3_UPLOAD_PREFIX;
  const acl = process.env.S3_UPLOAD_ACL === 'public-read' ? 'public-read' : undefined;
  const profile = process.env.S3_UPLOAD_PROFILE ?? process.env.AWS_PROFILE;

  return { bucket, prefix, region, acl, profile };
}

/**
 * Create custom MCP server with audio transcription tools
 */
export const audioTranscriberServer = createSdkMcpServer({
  name: 'audio-transcriber',
  version: '1.0.0',
  tools: [
    tool(
      'list_audio_files',
      'List all available audio files in the audio/ directory',
      {},
      async () => {
        const audioDirectory = path.resolve(process.cwd(), DIRECTORIES.audio);

        try {
          const stats = await fs.stat(audioDirectory);
          if (stats.isFile()) {
            return {
              content: [{
                type: 'text' as const,
                text: 'Audio directory path points to a file, not a directory'
              }]
            };
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {
              content: [{
                type: 'text' as const,
                text: `Audio directory '${audioDirectory}' does not exist. Please create it and add audio files.`
              }]
            };
          }
          return {
            content: [{
              type: 'text' as const,
              text: `Error accessing audio directory: ${error}`
            }]
          };
        }

        try {
          const dirEntries = await fs.readdir(audioDirectory);
          const audioFiles = dirEntries
            .filter((entry) => entry.isFile())
            .map((entry) => path.resolve(audioDirectory, entry.name))
            .filter((filePath) => isSupportedAudioFile(filePath));

          if (audioFiles.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: `No supported audio files found in '${audioDirectory}'. Supported formats: .mp3, .wav, .flac, .m4a, .ogg`
              }]
            };
          }

          const fileList = audioFiles
            .map((file, index) => `${index + 1}. ${path.basename(file)}`)
            .join('\n');

          return {
            content: [{
              type: 'text' as const,
              text: `Found ${audioFiles.length} audio file(s):\n${fileList}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error reading audio directory: ${error}`
            }]
          };
        }
      }
    ),

    tool(
      'list_models',
      'List all available Gemini models for transcription',
      {},
      async () => {
        const modelList = VALID_MODELS
          .map((model, index) => `${index + 1}. ${model}`)
          .join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: `Available Gemini models:\n${modelList}\n\nRecommendation: Use gemini-2.5-pro for highest accuracy, or gemini-flash-latest for faster/cheaper processing.`
          }]
        };
      }
    ),

    tool(
      'transcribe_audio',
      'Transcribe and diarize an audio file using Google Gemini',
      {
        filePath: z.string().describe('Full path to the audio file to transcribe'),
        modelChoice: z.enum(['gemini-2.5-pro', 'gemini-flash-latest']).describe('Gemini model to use for transcription'),
        speakers: z.array(z.object({
          label: z.string().describe('Speaker label/name'),
          description: z.string().optional().describe('Optional description of the speaker'),
        })).optional().describe('Optional array of speaker profiles for better diarization'),
      },
      async ({ filePath, modelChoice, speakers }) => {
        // Validate file path
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);

        const validationError = await validateAudioFile(resolvedPath, fs);
        if (validationError) {
          return {
            content: [{
              type: 'text' as const,
              text: `Validation error: ${validationError}`
            }]
          };
        }

        try {
          logger.info(`Starting transcription of '${path.basename(resolvedPath)}'...`);

          const { transcription, usageMetadata } = await transcribeAndDiarize(
            resolvedPath,
            modelChoice,
            fs,
            logger,
            speakers
          );

          // Store in session for later use
          sessionStorage.lastTranscription = transcription;
          sessionStorage.lastUsageMetadata = usageMetadata;
          sessionStorage.lastFilePath = resolvedPath;
          sessionStorage.lastModelChoice = modelChoice;
          sessionStorage.lastSpeakers = speakers;

          let result = `✓ Transcription completed successfully!\n\n`;
          result += `File: ${path.basename(resolvedPath)}\n`;
          result += `Model: ${modelChoice}\n\n`;

          if (usageMetadata) {
            result += `Token Usage:\n`;
            result += `  - Input tokens: ${usageMetadata.promptTokenCount}\n`;
            result += `  - Output tokens: ${usageMetadata.candidatesTokenCount}\n`;
            result += `  - Total tokens: ${usageMetadata.totalTokenCount}\n\n`;

            const costEstimate = estimateCost(modelChoice, usageMetadata);
            if (costEstimate) {
              result += `Estimated Cost:\n`;
              result += `  - Input: ${toCurrency(costEstimate.inputCost)}\n`;
              result += `  - Output: ${toCurrency(costEstimate.outputCost)}\n`;
              result += `  - Total: ${toCurrency(costEstimate.totalCost)}\n\n`;
            }
          }

          result += `Transcription Preview (first 500 chars):\n`;
          result += `${transcription.substring(0, 500)}${transcription.length > 500 ? '...' : ''}\n\n`;
          result += `Use save_report tool to save the full transcription in various formats.`;

          return {
            content: [{
              type: 'text' as const,
              text: result
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Transcription failed: ${error instanceof Error ? error.message : String(error)}`
            }]
          };
        }
      }
    ),

    tool(
      'estimate_cost',
      'Estimate the cost of transcribing an audio file with a specific model',
      {
        modelChoice: z.enum(['gemini-2.5-pro', 'gemini-flash-latest']).describe('Gemini model to estimate cost for'),
        audioLengthMinutes: z.number().optional().describe('Estimated audio length in minutes (if known)'),
      },
      async ({ modelChoice, audioLengthMinutes }) => {
        let result = `Cost estimation for ${modelChoice}:\n\n`;

        if (modelChoice === 'gemini-2.5-pro') {
          result += `Pricing:\n`;
          result += `  - Input: $1.25 per 1M tokens\n`;
          result += `  - Output: $10.00 per 1M tokens\n`;
          result += `  - Assumption: Standard tier, prompts ≤ 200k tokens\n`;
        } else {
          result += `Pricing:\n`;
          result += `  - Input: $1.00 per 1M tokens\n`;
          result += `  - Output: $2.50 per 1M tokens\n`;
          result += `  - Assumption: Gemini 2.5 Flash, audio input pricing\n`;
        }

        if (audioLengthMinutes) {
          // Rough estimate: ~400-600 tokens per minute of audio for input
          const estimatedInputTokens = audioLengthMinutes * 500;
          // Output is typically 2-3x smaller than input
          const estimatedOutputTokens = audioLengthMinutes * 200;

          const pricing = modelChoice === 'gemini-2.5-pro'
            ? { input: 1.25, output: 10 }
            : { input: 1.0, output: 2.5 };

          const inputCost = (estimatedInputTokens / 1000000) * pricing.input;
          const outputCost = (estimatedOutputTokens / 1000000) * pricing.output;
          const totalCost = inputCost + outputCost;

          result += `\nEstimate for ${audioLengthMinutes} minutes of audio:\n`;
          result += `  - Estimated input tokens: ~${estimatedInputTokens.toLocaleString()}\n`;
          result += `  - Estimated output tokens: ~${estimatedOutputTokens.toLocaleString()}\n`;
          result += `  - Estimated total cost: ${toCurrency(totalCost)}\n`;
        }

        result += `\nNote: Actual costs may vary based on audio complexity and transcription length.`;
        result += `\nSource: https://ai.google.dev/gemini-api/docs/pricing`;

        return {
          content: [{
            type: 'text' as const,
            text: result
          }]
        };
      }
    ),

    tool(
      'save_report',
      'Save the last transcription to one or more output formats',
      {
        formats: z.array(z.enum(['md', 'docx', 'pdf'])).describe('Output formats to save (md, docx, pdf)'),
        uploadToS3: z.boolean().optional().describe('Whether to upload reports to S3 (requires S3 config in environment)'),
      },
      async ({ formats, uploadToS3 }) => {
        if (!sessionStorage.lastTranscription) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No transcription available. Please run transcribe_audio first.'
            }]
          };
        }

        if (formats.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No formats specified. Please provide at least one format: md, docx, or pdf'
            }]
          };
        }

        const s3Config = uploadToS3 ? resolveS3UploadConfig() : undefined;
        if (uploadToS3 && !s3Config) {
          logger.warn('S3 upload requested but S3_UPLOAD_BUCKET is not configured');
        }

        try {
          await saveTranscriptionReport(
            {
              transcription: sessionStorage.lastTranscription,
              formats: formats as OutputFormat[],
              context: {
                audioFilePath: sessionStorage.lastFilePath,
                modelChoice: sessionStorage.lastModelChoice,
                speakers: sessionStorage.lastSpeakers,
                usageMetadata: sessionStorage.lastUsageMetadata,
              },
              uploads: (uploadToS3 && s3Config) ? { s3: s3Config } : undefined,
            },
            fs,
            logger
          );

          const savedFormats = formats
            .map(f => OUTPUT_FORMATS.find(def => def.id === f)?.label || f)
            .join(', ');

          let result = `✓ Reports saved successfully!\n\n`;
          result += `Formats: ${savedFormats}\n`;
          result += `Location: ./transcripts/\n`;

          if (uploadToS3 && s3Config) {
            result += `\n✓ Uploaded to S3: ${s3Config.bucket}`;
            if (s3Config.prefix) {
              result += `/${s3Config.prefix}`;
            }
          }

          return {
            content: [{
              type: 'text' as const,
              text: result
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Failed to save reports: ${error instanceof Error ? error.message : String(error)}`
            }]
          };
        }
      }
    ),

    tool(
      'get_transcription_text',
      'Get the full text of the last transcription',
      {},
      async () => {
        if (!sessionStorage.lastTranscription) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No transcription available. Please run transcribe_audio first.'
            }]
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: sessionStorage.lastTranscription
          }]
        };
      }
    ),
  ]
});

export { sessionStorage };