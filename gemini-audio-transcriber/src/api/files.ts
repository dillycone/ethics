import * as path from "path";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/files";
import { FILES_API_CONFIG } from "../config.js";
import { Logger } from "../types.js";

const { pollIntervalMs, maxPollAttempts } = FILES_API_CONFIG;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadAudioFileViaFilesApi(
  filePath: string,
  mimeType: string,
  apiKey: string,
  logger: Logger
): Promise<string> {
  const fileManager = new GoogleAIFileManager(apiKey);
  const displayName = path.basename(filePath);

  logger.info("Uploading audio via Gemini Files API...");
  const uploadResponse = await fileManager.uploadFile(filePath, {
    displayName,
    mimeType,
  });

  let file = uploadResponse.file;
  if (!file) {
    throw new Error("Files API response did not include file metadata.");
  }

  const fileName = file.name;

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    if (file.state === FileState.ACTIVE) {
      logger.info("Files API processing complete.");
      return file.uri;
    }

    if (file.state === FileState.FAILED) {
      const reason = file.error?.message ?? "unknown failure";
      throw new Error(`Files API processing failed: ${reason}`);
    }

    logger.info(
      `Waiting for Files API processing (state: ${file.state}, attempt ${attempt + 1}/${maxPollAttempts})...`
    );
    await wait(pollIntervalMs);
    file = await fileManager.getFile(fileName);
  }

  throw new Error(
    `Files API processing timed out after ${(pollIntervalMs * maxPollAttempts) / 1000}s (last state: ${file.state}).`
  );
}
