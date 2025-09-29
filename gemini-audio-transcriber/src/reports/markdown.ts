import { ReportData } from "../types.js";
import { escapeMarkdown } from "../utils/validation.js";

/**
 * Builds a markdown report from report data
 */
export function buildMarkdownReport(data: ReportData): string {
  const lines: string[] = [];

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
    lines.push(`| ${escapeMarkdown(entry.label)} | ${escapeMarkdown(entry.value)} |`);
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