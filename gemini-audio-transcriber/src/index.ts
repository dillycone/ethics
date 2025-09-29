import * as path from "path";
import * as dotenv from "dotenv";
import { ModelChoice, OutputFormat, SpeakerProfile, S3UploadConfig } from "./types.js";
import { VALID_MODELS, PRICING_REFERENCE_URL } from "./config.js";
import { ConsoleLogger } from "./utils/logger.js";
import { NodeFileSystem } from "./utils/filesystem.js";
import { validateAudioFile } from "./utils/validation.js";
import { toCurrency } from "./utils/formatting.js";
import { parseOutputFormats } from "./cli/parsers.js";
import { runCliWizard } from "./cli/prompts.js";
import { transcribeAndDiarize } from "./api/gemini.js";
import { estimateCost } from "./api/pricing.js";
import { saveTranscriptionReport } from "./reports/index.js";
import { runInteractiveAgent } from "./interactive-agent.js";
import { guidedTranscription, quickTranscribe } from "./agent-mode.js";

// Load environment variables from .env file
dotenv.config();

/**
 * Main function to parse command-line arguments and run the script.
 */
async function main() {
  const logger = new ConsoleLogger();
  const fs = new NodeFileSystem();

  const rawArgs = process.argv.slice(2);

  // Check for agent mode flags first
  if (rawArgs.includes('--interactive')) {
    logger.info('Starting interactive agent mode...');
    await runInteractiveAgent();
    return;
  }

  if (rawArgs.includes('--agent')) {
    logger.info('Starting agent mode with guided transcription...');
    await guidedTranscription({ verbose: rawArgs.includes('--verbose') });
    return;
  }

  // Check for quick agent mode with file path
  const agentFileIndex = rawArgs.indexOf('--agent-file');
  if (agentFileIndex !== -1 && rawArgs[agentFileIndex + 1]) {
    const filePath = rawArgs[agentFileIndex + 1];
    const modelIndex = rawArgs.indexOf('--model');
    const modelChoice = (modelIndex !== -1 && rawArgs[modelIndex + 1]
      ? rawArgs[modelIndex + 1]
      : 'gemini-2.5-pro') as ModelChoice;

    logger.info(`Starting quick agent transcription for '${filePath}'...`);
    await quickTranscribe({
      filePath,
      modelChoice,
      formats: ['md'],
      verbose: rawArgs.includes('--verbose')
    });
    return;
  }

  const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
    if (!value) {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n"].includes(normalized)) {
      return false;
    }
    return undefined;
  };

  const resolveS3UploadConfig = (): S3UploadConfig | undefined => {
    const bucket = process.env.S3_UPLOAD_BUCKET;
    if (!bucket) {
      return undefined;
    }

    const region = process.env.S3_UPLOAD_REGION ?? process.env.AWS_REGION;
    const prefix = process.env.S3_UPLOAD_PREFIX;
    const acl = process.env.S3_UPLOAD_ACL === "public-read" ? "public-read" : undefined;
    const profile = process.env.S3_UPLOAD_PROFILE ?? process.env.AWS_PROFILE;

    return { bucket, prefix, region, acl, profile };
  };

  const s3Config = resolveS3UploadConfig();

  const filteredArgs: string[] = [];
  let uploadToS3Flag: boolean | undefined;

  rawArgs.forEach((arg) => {
    if (arg === "--upload-s3") {
      uploadToS3Flag = true;
      return;
    }
    if (arg === "--no-upload-s3") {
      uploadToS3Flag = false;
      return;
    }
    filteredArgs.push(arg);
  });

  const defaultUploadToS3 = parseBooleanEnv(process.env.S3_UPLOAD_DEFAULT);
  let uploadToS3 = uploadToS3Flag ?? defaultUploadToS3 ?? false;

  if (uploadToS3 && !s3Config) {
    logger.warn(
      "S3 upload requested but configuration is incomplete. Provide S3_UPLOAD_BUCKET (and optional region/prefix) in the environment."
    );
    uploadToS3 = false;
  }

  const args = filteredArgs;

  let modelChoice: ModelChoice;
  let filePath: string;
  let speakers: SpeakerProfile[] | undefined;
  let formats: OutputFormat[] = [];
  let wizardUploadToS3: boolean | undefined;

  if (args.length === 0) {
    // Interactive wizard mode
    ({ modelChoice, filePath, speakers, formats, uploadToS3: wizardUploadToS3 } = await runCliWizard(
      fs,
      logger,
      {
        s3UploadAvailable: Boolean(s3Config),
        defaultUploadToS3: uploadToS3,
        s3BucketName: s3Config?.bucket,
      }
    ));
    if (wizardUploadToS3 !== undefined) {
      uploadToS3 = wizardUploadToS3;
    }
  } else if (args.length === 2 || args.length === 3) {
    // Non-interactive mode
    const modelArg = args[0];
    if (!VALID_MODELS.includes(modelArg as ModelChoice)) {
      logger.error(`Invalid model: ${modelArg}`);
      logger.error(`Please choose from one of the following: ${VALID_MODELS.join(", ")}`);
      process.exit(1);
    }
    modelChoice = modelArg as ModelChoice;

    filePath = path.resolve(process.cwd(), args[1]);
    const validationError = await validateAudioFile(filePath, fs);
    if (validationError) {
      logger.error(validationError);
      process.exit(1);
    }

    speakers = undefined;

    const formatInput = args[2];
    if (formatInput) {
      formats = parseOutputFormats(formatInput);
      if (formats.length === 0) {
        logger.warn(
          `No valid export formats detected in '${formatInput}'. Transcription will only be displayed in the console.`
        );
      }
    }
  } else {
    logger.error("Usage: npm start <model> <file_path> [formats]");
    logger.error("Example: npm start gemini-2.5-pro audio/sample-dialogue.mp3 md,pdf");
    logger.error("Optional third argument to save formats, e.g. 'md,pdf' or '1,3'.");
    logger.error("Flags: --upload-s3 to push saved reports to S3 (requires configuration).");
    logger.error("");
    logger.error("Agent Modes:");
    logger.error("  --interactive          Launch conversational agent mode (chat with Claude)");
    logger.error("  --agent                Launch guided agent mode (Claude orchestrates workflow)");
    logger.error("  --agent-file <path>    Quick agent transcription of a specific file");
    logger.error("  --verbose              Show detailed agent execution information");
    logger.error("");
    logger.error("Or run 'npm start' with no arguments to launch the interactive wizard.");
    logger.error(`Available models: ${VALID_MODELS.join(", ")}`);
    process.exit(1);
  }

  try {
    const { transcription, usageMetadata } = await transcribeAndDiarize(
      filePath,
      modelChoice,
      fs,
      logger,
      speakers
    );

    // Display cost estimate
    if (usageMetadata) {
      const costEstimate = estimateCost(modelChoice, usageMetadata);
      if (costEstimate) {
        logger.info("Estimated cost:");
        logger.info(`  Input cost: ${toCurrency(costEstimate.inputCost)}`);
        logger.info(`  Output cost: ${toCurrency(costEstimate.outputCost)}`);
        logger.info(`  Total cost: ${toCurrency(costEstimate.totalCost)}`);
        console.log(`  Assumption: ${costEstimate.assumption}`);
        console.log(`  Source: ${PRICING_REFERENCE_URL}`);
      }
    }

    // Save reports
    if (formats.length > 0) {
      if (uploadToS3 && !s3Config) {
        logger.warn(
          "Skipping S3 upload because configuration is missing. Provide S3_UPLOAD_BUCKET to enable uploads."
        );
      }

      const shouldUploadReports = uploadToS3 && Boolean(s3Config);

      await saveTranscriptionReport(
        {
          transcription,
          formats,
          context: {
            audioFilePath: filePath,
            modelChoice,
            speakers,
            usageMetadata,
          },
          uploads: shouldUploadReports ? { s3: s3Config } : undefined,
        },
        fs,
        logger
      );
    } else {
      console.log(
        "Transcription was not saved to disk. Select a format via the wizard or CLI argument to persist the report."
      );
      if (uploadToS3) {
        logger.warn("S3 upload requested but no export formats were selected, so nothing was uploaded.");
      }
    }
  } catch (error) {
    logger.error(`An error occurred during transcription: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

// Run the main function unless explicitly skipped (useful for tests and scripts)
if (process.env.SKIP_TRANSCRIBER_MAIN !== "1") {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  });
}
