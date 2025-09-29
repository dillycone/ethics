import PDFDocument from "pdfkit";
import { FileSystem, ReportData } from "../types.js";
import { PDF_STYLES } from "../config.js";

/**
 * Draws a section divider line
 */
function drawSectionDivider(
  document: PDFKit.PDFDocument,
  spacingAfter: number = PDF_STYLES.spacing.dividerAfter
): void {
  const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
  const lineY = document.y;
  document.save();
  document.lineWidth(PDF_STYLES.lineWidth.divider);
  document.strokeColor(PDF_STYLES.colors.divider);
  document.moveTo(document.page.margins.left, lineY);
  document.lineTo(document.page.margins.left + contentWidth, lineY);
  document.stroke();
  document.restore();
  document.moveDown(spacingAfter);
}

/**
 * Renders the PDF header on new pages
 */
function setupPageHeader(document: PDFKit.PDFDocument, title: string): void {
  document.on("pageAdded", () => {
    document
      .fillColor(PDF_STYLES.colors.subtitle)
      .font("Helvetica")
      .fontSize(PDF_STYLES.fontSizes.footer)
      .text(title, { align: "right" });
    document.moveDown(0.3);
    drawSectionDivider(document, 0.5);
    document
      .fillColor(PDF_STYLES.colors.heading)
      .font("Helvetica-Bold")
      .fontSize(PDF_STYLES.fontSizes.subtitle)
      .text("Transcript (continued)");
    document.moveDown(0.35);
    document
      .fillColor(PDF_STYLES.colors.text)
      .font("Helvetica")
      .fontSize(PDF_STYLES.fontSizes.transcript);
  });
}

/**
 * Renders the title section
 */
function renderTitle(document: PDFKit.PDFDocument, title: string, subtitle: string): void {
  document
    .fillColor(PDF_STYLES.colors.heading)
    .font("Helvetica-Bold")
    .fontSize(PDF_STYLES.fontSizes.title)
    .text(title, { align: "center" });
  document.moveDown(PDF_STYLES.spacing.titleAfter);
  document
    .fillColor(PDF_STYLES.colors.subtitle)
    .font("Helvetica-Oblique")
    .fontSize(PDF_STYLES.fontSizes.subtitle)
    .text(subtitle, { align: "center" });
  document.moveDown(PDF_STYLES.spacing.subtitleAfter);
  drawSectionDivider(document);
}

/**
 * Renders the session details section
 */
function renderSessionDetails(document: PDFKit.PDFDocument, metadata: ReportData["metadata"]): void {
  document
    .fillColor(PDF_STYLES.colors.heading)
    .font("Helvetica-Bold")
    .fontSize(PDF_STYLES.fontSizes.sectionHeading)
    .text("Session Details");
  document.moveDown(PDF_STYLES.spacing.sectionHeadingAfter);

  metadata.forEach((entry) => {
    document
      .fillColor(PDF_STYLES.colors.subtitle)
      .font("Helvetica")
      .fontSize(PDF_STYLES.fontSizes.metadataLabel)
      .text(entry.label.toUpperCase());
    document
      .fillColor(PDF_STYLES.colors.text)
      .font("Helvetica")
      .fontSize(PDF_STYLES.fontSizes.metadataValue)
      .text(entry.value, { paragraphGap: PDF_STYLES.spacing.metadataGap });
  });

  document.moveDown(PDF_STYLES.spacing.paragraphGap);
  drawSectionDivider(document);
}

/**
 * Renders the transcript section
 */
function renderTranscript(document: PDFKit.PDFDocument, transcriptLines: string[]): void {
  document
    .fillColor(PDF_STYLES.colors.heading)
    .font("Helvetica-Bold")
    .fontSize(PDF_STYLES.fontSizes.sectionHeading)
    .text("Transcript");
  document.moveDown(PDF_STYLES.spacing.paragraphGap);
  document
    .fillColor(PDF_STYLES.colors.text)
    .font("Helvetica")
    .fontSize(PDF_STYLES.fontSizes.transcript);

  if (transcriptLines.length === 0) {
    document
      .fillColor(PDF_STYLES.colors.subtitle)
      .font("Helvetica-Oblique")
      .text("No transcript content returned by the model.");
  } else {
    transcriptLines.forEach((line) => {
      if (line.length === 0) {
        document.moveDown(PDF_STYLES.spacing.transcriptParagraphGap);
        return;
      }

      document.text(line, { lineGap: PDF_STYLES.spacing.transcriptLineGap });
    });
  }
}

/**
 * Renders the footer
 */
function renderFooter(document: PDFKit.PDFDocument): void {
  document.moveDown(1);
  drawSectionDivider(document, 0.5);
  document
    .fillColor(PDF_STYLES.colors.subtitle)
    .font("Helvetica-Oblique")
    .fontSize(PDF_STYLES.fontSizes.footer)
    .text("Generated automatically by Gemini Audio Transcriber.");
}

/**
 * Writes a PDF report to the specified path
 */
export async function writePdfReport(
  targetPath: string,
  data: ReportData,
  fs: FileSystem
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ margin: PDF_STYLES.margins.default });
    const writeStream = fs.createWriteStream(targetPath);

    setupPageHeader(document, data.title);
    document.pipe(writeStream);

    renderTitle(document, data.title, data.subtitle);
    renderSessionDetails(document, data.metadata);
    renderTranscript(document, data.transcriptLines);
    renderFooter(document);

    document.end();

    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    document.on("error", reject);
  });
}