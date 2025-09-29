import * as path from "path";
import * as readline from "readline";
import { FileSystem, Logger, ModelChoice, OutputFormat, SpeakerProfile } from "../types.js";
import { VALID_MODELS, OUTPUT_FORMATS, DIRECTORIES } from "../config.js";
import { colorize } from "../utils/logger.js";
import {
  isSupportedAudioFile,
  validateAudioFile,
  sanitizeString,
  validateSpeakerLabel,
  validateSpeakerDescription,
  validateSpeakerCount,
} from "../utils/validation.js";
import { formatDisplayPath } from "../utils/formatting.js";
import { parseOutputFormats } from "./parsers.js";

export interface WizardOptions {
  s3UploadAvailable: boolean;
  defaultUploadToS3: boolean;
  s3BucketName?: string;
}

/**
 * Promisified readline question helper.
 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function promptS3UploadPreference(
  rl: readline.Interface,
  logger: Logger,
  options: WizardOptions,
  hasFormats: boolean
): Promise<boolean> {
  if (!options.s3UploadAvailable || !hasFormats) {
    if (options.s3UploadAvailable && !hasFormats && options.defaultUploadToS3) {
      logger.warn("S3 upload is enabled by default, but no export formats were selected.");
    }
    return false;
  }

  const bucketLabel = options.s3BucketName ? ` '${options.s3BucketName}'` : "";
  const defaultEnabled = options.defaultUploadToS3;
  const choiceHint = defaultEnabled ? "Y/n" : "y/N";

  while (true) {
    const answer = (
      await askQuestion(
        rl,
        colorize(`Upload reports to S3${bucketLabel}? (${choiceHint}): `, "cyan")
      )
    ).trim();

    if (answer.length === 0) {
      return defaultEnabled;
    }

    const normalized = answer.toLowerCase();
    if (["y", "yes"].includes(normalized)) {
      return true;
    }
    if (["n", "no"].includes(normalized)) {
      return false;
    }

    logger.warn("Please answer with 'y' or 'n'.");
  }
}

/**
 * Lists supported audio files in the given directory.
 */
async function listAudioFiles(directory: string, fs: FileSystem, logger: Logger): Promise<string[]> {
  try {
    const stats = await fs.stat(directory);
    if (!stats.isFile()) {
      // Directory exists, read it
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    logger.warn(`Unable to read audio directory '${directory}': ${error}`);
    return [];
  }

  try {
    const dirEntries = await fs.readdir(directory);
    return dirEntries
      .filter((entry) => entry.isFile())
      .map((entry) => path.resolve(directory, entry.name))
      .filter((filePath) => isSupportedAudioFile(filePath));
  } catch (error) {
    logger.warn(`Unable to read audio directory '${directory}': ${error}`);
    return [];
  }
}

/**
 * Prompts user to select a model
 */
export async function promptModelChoice(rl: readline.Interface): Promise<ModelChoice> {
  console.log(colorize("\nAvailable models:", "magenta", { bold: true }));
  VALID_MODELS.forEach((model, index) => {
    const numberedLabel = colorize(`${index + 1}.`, "gray");
    const modelName = colorize(model, "cyan");
    console.log(`  ${numberedLabel} ${modelName}`);
  });

  while (true) {
    const answer = (
      await askQuestion(
        rl,
        colorize(`Select a model [1-${VALID_MODELS.length}] or type the model id: `, "cyan")
      )
    ).trim();

    const numericChoice = Number.parseInt(answer, 10);
    if (!Number.isNaN(numericChoice) && numericChoice >= 1 && numericChoice <= VALID_MODELS.length) {
      return VALID_MODELS[numericChoice - 1];
    }

    if (VALID_MODELS.includes(answer as ModelChoice)) {
      return answer as ModelChoice;
    }

    console.log(
      colorize(
        `Invalid selection. Please enter a number between 1 and ${VALID_MODELS.length} or a valid model id.`,
        "yellow"
      )
    );
  }
}

/**
 * Prompts user to select an audio file
 */
export async function promptAudioFile(
  rl: readline.Interface,
  fs: FileSystem,
  logger: Logger
): Promise<string> {
  const audioDirectory = path.resolve(process.cwd(), DIRECTORIES.audio);
  const availableFiles = await listAudioFiles(audioDirectory, fs, logger);

  if (availableFiles.length > 0) {
    console.log(colorize("\nAvailable audio files:", "magenta", { bold: true }));
    availableFiles.forEach((file, index) => {
      const numberedLabel = colorize(`${index + 1}.`, "gray");
      const fileLabel = colorize(formatDisplayPath(file), "green");
      console.log(`  ${numberedLabel} ${fileLabel}`);
    });
    const customOption = colorize(`${availableFiles.length + 1}.`, "gray");
    console.log(`  ${customOption} ${colorize("Enter a custom file path", "cyan")}`);
  } else {
    logger.warn(`\nNo audio files detected in the '${DIRECTORIES.audio}' directory.`);
  }

  while (true) {
    let selection: string;

    if (availableFiles.length > 0) {
      selection = (
        await askQuestion(
          rl,
          colorize(`Select an audio file [1-${availableFiles.length + 1}] or type a path: `, "cyan")
        )
      ).trim();

      const selectedNumber = Number.parseInt(selection, 10);
      if (!Number.isNaN(selectedNumber)) {
        if (selectedNumber >= 1 && selectedNumber <= availableFiles.length) {
          return availableFiles[selectedNumber - 1];
        }

        if (selectedNumber === availableFiles.length + 1) {
          selection = (
            await askQuestion(rl, colorize("Enter the path to your audio file: ", "cyan"))
          ).trim();
        }
      }
    } else {
      selection = (
        await askQuestion(rl, colorize("Enter the path to your audio file: ", "cyan"))
      ).trim();
    }

    const resolvedPath = path.resolve(process.cwd(), selection);
    const validationMessage = await validateAudioFile(resolvedPath, fs);
    if (validationMessage) {
      logger.warn(validationMessage);
      continue;
    }
    return resolvedPath;
  }
}

/**
 * Prompts user for speaker count with validation
 */
export async function promptSpeakerCount(rl: readline.Interface, logger: Logger): Promise<number> {
  while (true) {
    const answer = (
      await askQuestion(rl, colorize("How many speakers are in the audio file? ", "cyan"))
    ).trim();

    const count = Number.parseInt(answer, 10);
    if (Number.isNaN(count) || count <= 0) {
      logger.warn("Please enter a positive integer for the number of speakers.");
      continue;
    }

    const validationError = validateSpeakerCount(count);
    if (validationError) {
      logger.warn(validationError);
      continue;
    }

    return count;
  }
}

/**
 * Prompts user for speaker profiles with validation and sanitization
 */
export async function promptSpeakerProfiles(
  rl: readline.Interface,
  speakerCount: number,
  logger: Logger
): Promise<SpeakerProfile[]> {
  const profiles: SpeakerProfile[] = [];

  for (let index = 0; index < speakerCount; index += 1) {
    const defaultLabel = `Speaker ${index + 1}`;

    while (true) {
      const rawName = (
        await askQuestion(
          rl,
          colorize(
            `Enter a name for ${defaultLabel} (press Enter to keep '${defaultLabel}'): `,
            "cyan"
          )
        )
      ).trim();

      let label = rawName || defaultLabel;
      label = sanitizeString(label, 100);

      const labelError = validateSpeakerLabel(label);
      if (labelError && rawName) {
        logger.warn(labelError);
        continue;
      }

      const rawDescription = (
        await askQuestion(rl, colorize(`Optional description for ${label} (press Enter to skip): `, "cyan"))
      ).trim();

      let description = sanitizeString(rawDescription, 500);

      if (description) {
        const descError = validateSpeakerDescription(description);
        if (descError) {
          logger.warn(descError);
          continue;
        }
      }

      profiles.push({
        label,
        description: description || undefined,
      });

      break;
    }
  }

  return profiles;
}

/**
 * Prompts user to select output formats
 */
export async function promptOutputFormats(
  rl: readline.Interface,
  logger: Logger
): Promise<OutputFormat[]> {
  console.log(colorize("\nSelect export format(s) for the transcription:", "magenta", { bold: true }));
  OUTPUT_FORMATS.forEach((format, index) => {
    const numberedLabel = colorize(`${index + 1}.`, "gray");
    const formatLabel = colorize(`${format.label} [${format.id}]`, "green");
    const description = colorize(format.description, "gray");
    console.log(`  ${numberedLabel} ${formatLabel} — ${description}`);
  });
  console.log(
    colorize(
      "Enter the matching numbers or IDs separated by commas (press Enter to skip saving).",
      "cyan"
    )
  );

  while (true) {
    const answer = (await askQuestion(rl, colorize("Formats: ", "cyan"))).trim();
    if (answer.length === 0) {
      return [];
    }

    const formats = parseOutputFormats(answer);
    if (formats.length > 0) {
      return formats;
    }

    logger.warn(
      `No valid formats detected. Available options: ${OUTPUT_FORMATS.map((format) => format.id).join(", ")}.`
    );
  }
}

/**
 * Displays a summary of user selections
 */
export function displaySelectionSummary(
  modelChoice: ModelChoice,
  filePath: string,
  speakers: SpeakerProfile[],
  formats: OutputFormat[],
  logger: Logger
): void {
  const selectionSummary = `Selected model '${modelChoice}' and audio file '${formatDisplayPath(filePath)}'.`;
  logger.success(`\n${selectionSummary}`);
  console.log(colorize("Speaker labels:", "magenta", { bold: true }));
  speakers.forEach((profile, index) => {
    const descriptionSuffix = profile.description ? ` - ${profile.description}` : "";
    const numberedLabel = colorize(`${index + 1}.`, "gray");
    const speakerLabel = colorize(profile.label, "green");
    const details = descriptionSuffix ? colorize(descriptionSuffix, "gray") : "";
    console.log(`  ${numberedLabel} ${speakerLabel}${details}`);
  });
  if (formats.length > 0) {
    const formattedList = formats
      .map((format) => OUTPUT_FORMATS.find((entry) => entry.id === format)?.label ?? format)
      .join(", ");
    console.log(colorize(`Exports: ${formattedList}`, "magenta", { bold: true }));
  } else {
    console.log(colorize("Exports: none (transcription will only display in the console)", "gray"));
  }
  console.log("");
}

/**
 * Runs the interactive CLI wizard
 */
export async function runCliWizard(
  fs: FileSystem,
  logger: Logger,
  options: WizardOptions = { s3UploadAvailable: false, defaultUploadToS3: false }
): Promise<{
  modelChoice: ModelChoice;
  filePath: string;
  speakers: SpeakerProfile[];
  formats: OutputFormat[];
  uploadToS3: boolean;
}> {
  console.log(colorize("\nGemini Audio Transcriber Wizard", "magenta", { bold: true }));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const modelChoice = await promptModelChoice(rl);
    const filePath = await promptAudioFile(rl, fs, logger);
    const speakerCount = await promptSpeakerCount(rl, logger);
    const speakerProfiles = await promptSpeakerProfiles(rl, speakerCount, logger);
    const formats = await promptOutputFormats(rl, logger);
    const uploadToS3 = await promptS3UploadPreference(rl, logger, options, formats.length > 0);

    displaySelectionSummary(modelChoice, filePath, speakerProfiles, formats, logger);

    return { modelChoice, filePath, speakers: speakerProfiles, formats, uploadToS3 };
  } finally {
    rl.close();
  }
}
