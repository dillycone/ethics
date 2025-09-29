import * as path from "path";
import { FileSystem, Logger, OutputFormat, SaveTranscriptionReportArgs } from "../types.js";
import { OUTPUT_FORMATS, DIRECTORIES } from "../config.js";
import { buildReportData } from "./builder.js";
import { buildMarkdownReport } from "./markdown.js";
import { writeDocxReport } from "./docx.js";
import { writePdfReport } from "./pdf.js";
import { formatDisplayPath, generateTimestamp } from "../utils/formatting.js";
import { S3Uploader } from "../utils/s3.js";

/**
 * Saves transcription reports in multiple formats
 */
export async function saveTranscriptionReport(
  args: SaveTranscriptionReportArgs,
  fs: FileSystem,
  logger: Logger
): Promise<void> {
  const { transcription, formats, context, uploads } = args;

  if (formats.length === 0) {
    return;
  }

  const generatedAt = new Date();
  const reportData = buildReportData(transcription, context, generatedAt);

  const transcriptsDirectory = path.resolve(process.cwd(), DIRECTORIES.transcripts);
  await fs.mkdir(transcriptsDirectory, { recursive: true });

  const audioBaseName = path.basename(context.audioFilePath, path.extname(context.audioFilePath));
  const timestamp = generateTimestamp(generatedAt);
  const baseFilename = audioBaseName ? `${audioBaseName}_${timestamp}` : `transcription_${timestamp}`;

  const savedFiles: string[] = [];
  const s3UploadedFiles: string[] = [];
  const s3Uploader = uploads?.s3 ? new S3Uploader(uploads.s3) : undefined;

  for (const format of formats) {
    const formatDefinition = OUTPUT_FORMATS.find((entry) => entry.id === format);
    if (!formatDefinition) {
      continue;
    }

    const targetPath = path.join(transcriptsDirectory, `${baseFilename}${formatDefinition.extension}`);

    try {
      switch (format) {
        case "md": {
          const markdown = buildMarkdownReport(reportData);
          await fs.writeFile(targetPath, markdown);
          break;
        }
        case "docx": {
          await writeDocxReport(targetPath, reportData, fs);
          break;
        }
        case "pdf": {
          await writePdfReport(targetPath, reportData, fs);
          break;
        }
        default:
          logger.warn(`Unknown format: ${format}`);
          break;
      }

      savedFiles.push(targetPath);

      if (s3Uploader) {
        try {
          const remoteLocation = await s3Uploader.uploadFile(targetPath);
          s3UploadedFiles.push(remoteLocation);
        } catch (error) {
          logger.error(
            `Failed to upload ${format.toUpperCase()} report to S3: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    } catch (error) {
      logger.error(`Failed to save ${format.toUpperCase()} report: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (savedFiles.length > 0) {
    logger.success("Saved transcription report:");
    savedFiles.forEach((file) => {
      logger.info(`  - ${formatDisplayPath(file)}`);
    });
  }

  if (s3UploadedFiles.length > 0) {
    logger.success("Uploaded report to S3:");
    s3UploadedFiles.forEach((location) => {
      logger.info(`  - ${location}`);
    });
  }
}
