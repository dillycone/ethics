import * as path from "path";
import { ReportData, ReportMetadataEntry, TranscriptionReportContext } from "../types.js";
import { estimateCost } from "../api/pricing.js";
import { toCurrency, formatNumber } from "../utils/formatting.js";

/**
 * Builds report data structure from transcription and context
 */
export function buildReportData(
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
    metadata.push({ label: "Prompt Tokens", value: formatNumber(usage.promptTokenCount) });
    metadata.push({ label: "Output Tokens", value: formatNumber(usage.candidatesTokenCount) });
    metadata.push({ label: "Total Tokens", value: formatNumber(usage.totalTokenCount) });

    const costEstimate = estimateCost(context.modelChoice, usage);
    if (costEstimate) {
      const costSummary = `${toCurrency(costEstimate.totalCost)} (input ${toCurrency(
        costEstimate.inputCost
      )}, output ${toCurrency(costEstimate.outputCost)})`;
      metadata.push({ label: "Estimated Cost", value: costSummary });
    }
  }

  const transcriptLines = transcription.split(/\r?\n/).map((line) => line.trimEnd());

  return {
    title: "Transcription Report",
    subtitle: path.basename(context.audioFilePath),
    metadata,
    transcriptLines,
  };
}