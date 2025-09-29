import { GoogleGenerativeAI, Part, UsageMetadata } from "@google/generative-ai";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as dotenv from "dotenv";

const fsp = fs.promises;

// Load environment variables from .env file
dotenv.config();

// Lightweight ANSI color helper to avoid pulling in an extra dependency.
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

// Define the allowed model choices as requested by the user
type ModelChoice = "gemini-2.5-pro" | "gemini-flash-latest";
const VALID_MODELS: ModelChoice[] = ["gemini-2.5-pro", "gemini-flash-latest"];
const SUPPORTED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".ogg"];

type OutputFormat = "md" | "docx" | "pdf";

const OUTPUT_FORMATS: Array<{
  id: OutputFormat;
  label: string;
  extension: string;
  description: string;
}> = [
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

function parseOutputFormats(input?: string | null): OutputFormat[] {
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

interface ModelPricing {
  /** Paid tier input price in USD per 1M tokens. */
  inputPerMillion: number;
  /** Paid tier output price in USD per 1M tokens. */
  outputPerMillion: number;
  /** Short note describing the assumption applied to this rate. */
  assumption: string;
}

const PRICING_REFERENCE_URL = "https://ai.google.dev/gemini-api/docs/pricing";

const MODEL_PRICING: Record<ModelChoice, ModelPricing> = {
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

function toCurrency(value: number): string {
  if (Number.isNaN(value)) {
    return "$0.00";
  }

  const rounded = value < 0.01 ? value.toFixed(4) : value.toFixed(2);
  return `$${rounded}`;
}

function estimateCost(
  modelChoice: ModelChoice,
  usage?: UsageMetadata
):
  | {
      inputCost: number;
      outputCost: number;
      totalCost: number;
      assumption: string;
    }
  | undefined {
  if (!usage) {
    return undefined;
  }

  const pricing = MODEL_PRICING[modelChoice];
  if (!pricing) {
    return undefined;
  }

  const { promptTokenCount = 0, candidatesTokenCount = 0 } = usage;

  const inputCost = (promptTokenCount / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (candidatesTokenCount / 1_000_000) * pricing.outputPerMillion;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    assumption: pricing.assumption,
  };
}

interface SpeakerProfile {
  label: string;
  description?: string;
}

/**
 * Maps the user's model choice to the actual model name available in the API.
 * Update here if Google renames models or introduces new aliases.
 */
const modelApiMapping: { [key in ModelChoice]: string } = {
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-flash-latest": "gemini-flash-latest",
};

/**
 * Promisified readline question helper.
 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Checks whether the provided file path has a supported audio extension.
 */
function isSupportedAudioFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.includes(extension);
}

/**
 * Lists supported audio files in the given directory.
 */
function listAudioFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  try {
    const dirEntries = fs.readdirSync(directory, { withFileTypes: true });
    return dirEntries
      .filter((entry) => entry.isFile())
      .map((entry) => path.resolve(directory, entry.name))
      .filter((filePath) => isSupportedAudioFile(filePath));
  } catch (error) {
    console.warn(colorize(`Unable to read audio directory '${directory}':`, "yellow"), error);
    return [];
  }
}

function formatDisplayPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  return relative || filePath;
}

async function promptModelChoice(rl: readline.Interface): Promise<ModelChoice> {
  console.log(colorize("\nAvailable models:", "magenta", { bold: true }));
  VALID_MODELS.forEach((model, index) => {
    const numberedLabel = colorize(`${index + 1}.`, "gray");
    const modelName = colorize(model, "cyan");
    console.log(`  ${numberedLabel} ${modelName}`);
  });

  while (true) {
    const answer = (await askQuestion(
      rl,
      colorize(`Select a model [1-${VALID_MODELS.length}] or type the model id: `, "cyan")
    )).trim();

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

async function promptAudioFile(rl: readline.Interface): Promise<string> {
  const audioDirectory = path.resolve(process.cwd(), "audio");
  const availableFiles = listAudioFiles(audioDirectory);

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
    console.log(colorize("\nNo audio files detected in the 'audio' directory.", "yellow"));
  }

  while (true) {
    if (availableFiles.length > 0) {
      const selection = (await askQuestion(
        rl,
        colorize(`Select an audio file [1-${availableFiles.length + 1}] or type a path: `, "cyan")
      )).trim();

      const selectedNumber = Number.parseInt(selection, 10);
      if (!Number.isNaN(selectedNumber)) {
        if (selectedNumber >= 1 && selectedNumber <= availableFiles.length) {
          return availableFiles[selectedNumber - 1];
        }

        if (selectedNumber === availableFiles.length + 1) {
          const customPath = (await askQuestion(
            rl,
            colorize("Enter the path to your audio file: ", "cyan")
          )).trim();
          const resolvedPath = path.resolve(process.cwd(), customPath);
          const validationMessage = validateAudioPath(resolvedPath);
          if (validationMessage) {
            console.log(colorize(validationMessage, "yellow"));
            continue;
          }
          return resolvedPath;
        }
      }

      const asPath = path.resolve(process.cwd(), selection);
      const validationMessage = validateAudioPath(asPath);
      if (validationMessage) {
        console.log(colorize(validationMessage, "yellow"));
        continue;
      }
      return asPath;
    } else {
      const response = (await askQuestion(
        rl,
        colorize("Enter the path to your audio file: ", "cyan")
      )).trim();
      const resolvedPath = path.resolve(process.cwd(), response);
      const validationMessage = validateAudioPath(resolvedPath);
      if (validationMessage) {
        console.log(colorize(validationMessage, "yellow"));
        continue;
      }
      return resolvedPath;
    }
  }
}

function validateAudioPath(resolvedPath: string): string | undefined {
  if (!resolvedPath) {
    return "Please provide a file path.";
  }

  if (!isSupportedAudioFile(resolvedPath)) {
    return `Unsupported file extension. Supported extensions: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}`;
  }

  if (!fs.existsSync(resolvedPath)) {
    return `File not found: ${resolvedPath}`;
  }

  return undefined;
}

async function promptSpeakerCount(rl: readline.Interface): Promise<number> {
  while (true) {
    const answer = (await askQuestion(
      rl,
      colorize("How many speakers are in the audio file? ", "cyan")
    )).trim();

    const count = Number.parseInt(answer, 10);
    if (!Number.isNaN(count) && count > 0) {
      return count;
    }

    console.log(colorize("Please enter a positive integer for the number of speakers.", "yellow"));
  }
}

async function promptSpeakerProfiles(
  rl: readline.Interface,
  speakerCount: number
): Promise<SpeakerProfile[]> {
  const profiles: SpeakerProfile[] = [];

  for (let index = 0; index < speakerCount; index += 1) {
    const defaultLabel = `Speaker ${index + 1}`;
    const rawName = (await askQuestion(
      rl,
      colorize(
        `Enter a name for ${defaultLabel} (press Enter to keep '${defaultLabel}'): `,
        "cyan"
      )
    )).trim();
    const label = rawName || defaultLabel;

    const rawDescription = (await askQuestion(
      rl,
      colorize(`Optional description for ${label} (press Enter to skip): `, "cyan")
    )).trim();

    profiles.push({
      label,
      description: rawDescription || undefined,
    });
  }

  return profiles;
}

async function promptOutputFormats(rl: readline.Interface): Promise<OutputFormat[]> {
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

    console.log(
      colorize(
        `No valid formats detected. Available options: ${OUTPUT_FORMATS.map((format) => format.id).join(", ")}.`,
        "yellow"
      )
    );
  }
}

async function runCliWizard(): Promise<{
  modelChoice: ModelChoice;
  filePath: string;
  speakers: SpeakerProfile[];
  formats: OutputFormat[];
}> {
  console.log(colorize("\nGemini Audio Transcriber Wizard", "magenta", { bold: true }));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const modelChoice = await promptModelChoice(rl);
    const filePath = await promptAudioFile(rl);
    const speakerCount = await promptSpeakerCount(rl);
    const speakerProfiles = await promptSpeakerProfiles(rl, speakerCount);
    const formats = await promptOutputFormats(rl);

    const selectionSummary =
      `Selected model '${modelChoice}' and audio file '${formatDisplayPath(filePath)}'.`;
    console.log(`\n${colorize(selectionSummary, "green")}`);
    console.log(colorize("Speaker labels:", "magenta", { bold: true }));
    speakerProfiles.forEach((profile, index) => {
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
      console.log(
        colorize("Exports: none (transcription will only display in the console)", "gray")
      );
    }
    console.log("");

    return { modelChoice, filePath, speakers: speakerProfiles, formats };
  } finally {
    rl.close();
  }
}

/**
 * Converts a local file to a GoogleGenerativeAI.Part object.
 * @param filePath The path to the local file.
 * @returns A Part object containing the file's data and MIME type.
 */
function fileToGenerativePart(filePath: string): Part {
  const fileExtension = path.extname(filePath).toLowerCase();
  let mimeType: string;

  // Determine MIME type based on file extension
  switch (fileExtension) {
    case ".mp3":
      mimeType = "audio/mpeg";
      break;
    case ".wav":
      mimeType = "audio/wav";
      break;
    case ".flac":
      mimeType = "audio/flac";
      break;
    case ".m4a":
      mimeType = "audio/mp4";
      break;
    case ".ogg":
      mimeType = "audio/ogg";
      break;
    default:
      throw new Error(`Unsupported audio file type: ${fileExtension}`);
  }

  const fileBuffer = fs.readFileSync(filePath);

  return {
    inlineData: {
      data: fileBuffer.toString("base64"),
      mimeType,
    },
  };
}

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
 * Transcribes and diarizes an audio file using the specified Gemini model.
 * @param filePath Path to the audio file.
 * @param userModelChoice The model selected by the user.
 * @param speakers Optional speaker label metadata provided by the user.
 */
async function transcribeAndDiarize(
  filePath: string,
  userModelChoice: ModelChoice,
  speakers?: SpeakerProfile[]
): Promise<{ transcription: string; usageMetadata?: UsageMetadata }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set in the .env file.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found at path: ${filePath}`);
  }

  // Get the actual, currently available API model name from our mapping
  const apiModelName = modelApiMapping[userModelChoice];

  console.log(
    colorize(
      `\nProcessing '${path.basename(filePath)}' with model choice '${userModelChoice}'...`,
      "cyan"
    )
  );

  // Inform the user if we are using a substitute model
  if (userModelChoice !== apiModelName) {
    console.log(
      colorize(
        `NOTE: '${userModelChoice}' is served by '${apiModelName}' in the current API.`,
        "yellow"
      )
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: apiModelName });

  const audioFilePart = fileToGenerativePart(filePath);

  if (speakers && speakers.length > 0) {
    console.log(colorize("Using speaker labels:", "magenta", { bold: true }));
    speakers.forEach((profile, index) => {
      const descriptionSuffix = profile.description ? ` - ${profile.description}` : "";
      const numberedLabel = colorize(`${index + 1}.`, "gray");
      const speakerLabel = colorize(profile.label, "green");
      const detail = descriptionSuffix ? colorize(descriptionSuffix, "gray") : "";
      console.log(`  ${numberedLabel} ${speakerLabel}${detail}`);
    });
  }

  const prompt = buildTranscriptionPrompt(speakers);

  const result = await model.generateContent([prompt, audioFilePart]);
  const response = result.response;
  const transcription = response.text() ?? "";

  console.log(colorize("\n--- Transcription and Diarization Result ---", "magenta", { bold: true }));
  console.log(transcription);
  console.log(colorize("------------------------------------------\n", "magenta", { bold: true }));

  const usageMetadata = response.usageMetadata;
  if (usageMetadata) {
    console.log(colorize("Token usage:", "magenta", { bold: true }));
    console.log(`  Prompt tokens: ${usageMetadata.promptTokenCount.toLocaleString()}`);
    console.log(`  Output tokens: ${usageMetadata.candidatesTokenCount.toLocaleString()}`);
    console.log(`  Total tokens: ${usageMetadata.totalTokenCount.toLocaleString()}`);

    const costEstimate = estimateCost(userModelChoice, usageMetadata);
    if (costEstimate) {
      console.log(colorize("Estimated cost:", "magenta", { bold: true }));
      console.log(`  Input cost: ${toCurrency(costEstimate.inputCost)}`);
      console.log(`  Output cost: ${toCurrency(costEstimate.outputCost)}`);
      console.log(`  Total cost: ${toCurrency(costEstimate.totalCost)}`);
      console.log(colorize(`  Assumption: ${costEstimate.assumption}`, "gray"));
      console.log(colorize(`  Source: ${PRICING_REFERENCE_URL}`, "gray"));
    }
  } else {
    console.log(colorize("Token usage metadata was not returned by the API.", "yellow"));
  }

  return { transcription, usageMetadata };
}

interface TranscriptionReportContext {
  audioFilePath: string;
  modelChoice: ModelChoice;
  speakers?: SpeakerProfile[];
  usageMetadata?: UsageMetadata;
}

interface SaveTranscriptionReportArgs {
  transcription: string;
  formats: OutputFormat[];
  context: TranscriptionReportContext;
}

interface ReportMetadataEntry {
  label: string;
  value: string;
}

export interface ReportData {
  title: string;
  subtitle: string;
  metadata: ReportMetadataEntry[];
  transcriptLines: string[];
}

async function saveTranscriptionReport({
  transcription,
  formats,
  context,
}: SaveTranscriptionReportArgs): Promise<void> {
  if (formats.length === 0) {
    return;
  }

  const generatedAt = new Date();
  const reportData = buildReportData(transcription, context, generatedAt);

  const transcriptsDirectory = path.resolve(process.cwd(), "transcripts");
  await fsp.mkdir(transcriptsDirectory, { recursive: true });

  const audioBaseName = path.basename(context.audioFilePath, path.extname(context.audioFilePath));
  const timestamp = generatedAt.toISOString().replace(/[:-]/g, "").slice(0, 15);
  const baseFilename = audioBaseName ? `${audioBaseName}_${timestamp}` : `transcription_${timestamp}`;

  const savedFiles: string[] = [];

  for (const format of formats) {
    const formatDefinition = OUTPUT_FORMATS.find((entry) => entry.id === format);
    if (!formatDefinition) {
      continue;
    }

    const targetPath = path.join(transcriptsDirectory, `${baseFilename}${formatDefinition.extension}`);

    switch (format) {
      case "md": {
        const markdown = buildMarkdownReport(reportData);
        await fsp.writeFile(targetPath, markdown, "utf8");
        break;
      }
      case "docx": {
        await writeDocxReport(targetPath, reportData);
        break;
      }
      case "pdf": {
        await writePdfReport(targetPath, reportData);
        break;
      }
      default:
        break;
    }

    savedFiles.push(targetPath);
  }

  if (savedFiles.length > 0) {
    console.log(colorize("Saved transcription report:", "green", { bold: true }));
    savedFiles.forEach((file) => {
      console.log(`  ${colorize("-", "gray")} ${colorize(formatDisplayPath(file), "green")}`);
    });
  }
}

function buildReportData(
  transcription: string,
  context: TranscriptionReportContext,
  generatedAt: Date
): ReportData {
  const metadata: ReportMetadataEntry[] = [];

  metadata.push({ label: "Source File", value: path.basename(context.audioFilePath) });
  metadata.push({ label: "Model", value: context.modelChoice });
  metadata.push({ label: "Generated", value: generatedAt.toLocaleString() });

  if (context.speakers && context.speakers.length > 0) {
    const speakerDescriptions = context.speakers.map((speaker) => {
      if (speaker.description) {
        return `${speaker.label} (${speaker.description})`;
      }
      return speaker.label;
    });
    metadata.push({ label: "Speakers", value: speakerDescriptions.join("; ") });
  } else {
    metadata.push({ label: "Speakers", value: "Not provided" });
  }

  const usage = context.usageMetadata;
  if (usage) {
    metadata.push({ label: "Prompt Tokens", value: usage.promptTokenCount.toLocaleString() });
    metadata.push({ label: "Output Tokens", value: usage.candidatesTokenCount.toLocaleString() });
    metadata.push({ label: "Total Tokens", value: usage.totalTokenCount.toLocaleString() });

    const costEstimate = estimateCost(context.modelChoice, usage);
    if (costEstimate) {
      const costSummary = `${toCurrency(costEstimate.totalCost)} (input ${toCurrency(
        costEstimate.inputCost
      )}, output ${toCurrency(costEstimate.outputCost)})`;
      metadata.push({ label: "Estimated Cost", value: costSummary });
    }
  }

  const transcriptLines = transcription
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  return {
    title: "Transcription Report",
    subtitle: path.basename(context.audioFilePath),
    metadata,
    transcriptLines,
  };
}

function buildMarkdownReport(data: ReportData): string {
  const lines: string[] = [];

  const escapeTableValue = (value: string): string =>
    value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br />");

  lines.push(`# ${data.title}`);
  lines.push("");
  lines.push(`_${data.subtitle}_`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Session Details");
  lines.push("");
  lines.push("| Detail | Value |");
  lines.push("| --- | --- |");
  data.metadata.forEach((entry) => {
    lines.push(`| ${escapeTableValue(entry.label)} | ${escapeTableValue(entry.value)} |`);
  });
  lines.push("");
  lines.push("## Transcript");
  lines.push("");
  if (data.transcriptLines.length === 0) {
    lines.push("_No transcript content returned by the model._");
  } else {
    data.transcriptLines.forEach((line) => {
      if (line.length === 0) {
        lines.push("");
      } else {
        lines.push(line);
      }
    });
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_Generated automatically by Gemini Audio Transcriber._");

  return lines.join("\n");
}

export async function writeDocxReport(targetPath: string, data: ReportData): Promise<void> {
  const defaultFont = "Calibri";
  const bodyTextSize = 22; // 11pt in half-points
  const headingSize = 32; // 16pt for section headings

  const metadataParagraphs = data.metadata.map(
    (entry) =>
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({ text: `${entry.label}: `, bold: true, font: defaultFont, size: bodyTextSize }),
          new TextRun({ text: entry.value, font: defaultFont, size: bodyTextSize }),
        ],
      })
  );

  const transcriptHeading = new Paragraph({
    spacing: { before: 360, after: 200 },
    children: [
      new TextRun({ text: "Transcript", bold: true, size: headingSize, font: defaultFont }),
    ],
  });

  const transcriptParagraphs = data.transcriptLines.length > 0
    ? data.transcriptLines.map((line) =>
        line.length > 0
          ? new Paragraph({
              spacing: { after: 160 },
              children: [new TextRun({ text: line, font: defaultFont, size: bodyTextSize })],
            })
          : new Paragraph({ spacing: { after: 160 } })
      )
    : [
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: "No transcript content returned by the model.",
              italics: true,
              font: defaultFont,
              size: bodyTextSize,
            }),
          ],
        }),
      ];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: defaultFont, size: bodyTextSize, color: "1F1F1F" },
          paragraph: { spacing: { after: 160 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({ text: data.title, bold: true, size: 40, font: defaultFont }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
            children: [
              new TextRun({ text: data.subtitle, italics: true, size: 24, font: defaultFont }),
            ],
          }),
          ...metadataParagraphs,
          transcriptHeading,
          ...transcriptParagraphs,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fsp.writeFile(targetPath, buffer);
}

async function writePdfReport(targetPath: string, data: ReportData): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ margin: 56 });
    const writeStream = fs.createWriteStream(targetPath);

    const headingColor = "#111827";
    const textColor = "#1F2933";
    const subtitleColor = "#4B5563";
    const dividerColor = "#CBD5E1";

    const drawSectionDivider = (spacingAfter = 0.75) => {
      const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
      const lineY = document.y;
      document.save();
      document.lineWidth(0.5);
      document.strokeColor(dividerColor);
      document.moveTo(document.page.margins.left, lineY);
      document.lineTo(document.page.margins.left + contentWidth, lineY);
      document.stroke();
      document.restore();
      document.moveDown(spacingAfter);
    };

    document.on("pageAdded", () => {
      document.fillColor(subtitleColor).font("Helvetica").fontSize(9).text(data.title, {
        align: "right",
      });
      document.moveDown(0.3);
      drawSectionDivider(0.5);
      document.fillColor(headingColor).font("Helvetica-Bold").fontSize(12).text("Transcript (continued)");
      document.moveDown(0.35);
      document.fillColor(textColor).font("Helvetica").fontSize(11);
    });

    document.pipe(writeStream);

    document.fillColor(headingColor).font("Helvetica-Bold").fontSize(22).text(data.title, { align: "center" });
    document.moveDown(0.35);
    document.fillColor(subtitleColor).font("Helvetica-Oblique").fontSize(12).text(data.subtitle, {
      align: "center",
    });
    document.moveDown(0.8);
    drawSectionDivider();

    document.fillColor(headingColor).font("Helvetica-Bold").fontSize(14).text("Session Details");
    document.moveDown(0.45);

    data.metadata.forEach((entry) => {
      document.fillColor(subtitleColor).font("Helvetica").fontSize(9).text(entry.label.toUpperCase());
      document.fillColor(textColor).font("Helvetica").fontSize(12).text(entry.value, {
        paragraphGap: 8,
      });
    });

    document.moveDown(0.4);
    drawSectionDivider();

    document.fillColor(headingColor).font("Helvetica-Bold").fontSize(14).text("Transcript");
    document.moveDown(0.4);
    document.fillColor(textColor).font("Helvetica").fontSize(11);

    if (data.transcriptLines.length === 0) {
      document.fillColor(subtitleColor).font("Helvetica-Oblique").text(
        "No transcript content returned by the model."
      );
    } else {
      data.transcriptLines.forEach((line) => {
        if (line.length === 0) {
          document.moveDown(0.35);
          return;
        }

        document.text(line, {
          lineGap: 4,
        });
      });
    }

    document.moveDown(1);
    drawSectionDivider(0.5);
    document.fillColor(subtitleColor).font("Helvetica-Oblique").fontSize(9).text(
      "Generated automatically by Gemini Audio Transcriber."
    );

    document.end();

    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    document.on("error", reject);
  });
}

/**
 * Main function to parse command-line arguments and run the script.
 */
async function main() {
  const args = process.argv.slice(2);

  let modelChoice: ModelChoice;
  let filePath: string;
  let speakers: SpeakerProfile[] | undefined;
  let formats: OutputFormat[] = [];

  if (args.length === 0) {
    ({ modelChoice, filePath, speakers, formats } = await runCliWizard());
  } else if (args.length === 2 || args.length === 3) {
    modelChoice = args[0] as ModelChoice;
    filePath = path.resolve(process.cwd(), args[1]);
    speakers = undefined;
    const formatInput = args[2];
    if (formatInput) {
      formats = parseOutputFormats(formatInput);
      if (formats.length === 0) {
        console.log(
          colorize(
            `No valid export formats detected in '${formatInput}'. Available options: ${OUTPUT_FORMATS.map((option) => option.id).join(", ")}.`,
            "yellow"
          )
        );
      }
    }
  } else {
    console.error(colorize("Usage: npm start <model> <file_path>", "red"));
    console.error(
      colorize("Example: npm start gemini-2.5-pro audio/sample-dialogue.mp3", "red")
    );
    console.error(
      colorize(
        "Optional third argument to save formats, e.g. 'md,pdf' or '1,3'.",
        "red"
      )
    );
    console.error(
      colorize("Or run 'npm start' with no arguments to launch the interactive wizard.", "red")
    );
    console.error(colorize(`Available models: ${VALID_MODELS.join(", ")}`, "red"));
    process.exit(1);
  }

  if (!VALID_MODELS.includes(modelChoice)) {
    console.error(colorize(`Invalid model: ${modelChoice}`, "red"));
    console.error(
      colorize(
        `Please choose from one of the following: ${VALID_MODELS.join(", ")}`,
        "red"
      )
    );
    process.exit(1);
  }

  const { transcription, usageMetadata } = await transcribeAndDiarize(
    filePath,
    modelChoice,
    speakers
  );

  if (formats.length > 0) {
    await saveTranscriptionReport({
      transcription,
      formats,
      context: {
        audioFilePath: filePath,
        modelChoice,
        speakers,
        usageMetadata,
      },
    });
  } else {
    console.log(
      colorize(
        "Transcription was not saved to disk. Select a format via the wizard or CLI argument to persist the report.",
        "gray"
      )
    );
  }
}

// Run the main function unless explicitly skipped (useful for tests and scripts)
if (process.env.SKIP_TRANSCRIBER_MAIN !== "1") {
  main().catch((error) => {
    console.error(colorize("An error occurred during transcription:", "red"), error);
    process.exitCode = 1;
  });
}
