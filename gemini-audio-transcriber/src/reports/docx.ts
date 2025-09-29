import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { FileSystem, ReportData } from "../types.js";
import { DOCX_STYLES } from "../config.js";

/**
 * Detects speaker labels in transcript lines and returns formatted text runs
 * Patterns: "Speaker 1:", "John:", "[Speaker A]:", etc.
 */
function parseTranscriptLine(line: string): TextRun[] {
  const speakerPatterns = [
    /^(\[?[A-Z][A-Za-z0-9\s]+\]?:)/,  // "Speaker 1:", "[John]:", etc.
    /^([A-Z][A-Za-z0-9\s]+:)/,         // "John:", "Speaker A:", etc.
  ];

  for (const pattern of speakerPatterns) {
    const match = line.match(pattern);
    if (match) {
      const speakerLabel = match[1];
      const content = line.substring(speakerLabel.length).trim();

      return [
        new TextRun({
          text: speakerLabel,
          bold: true,
          font: DOCX_STYLES.fonts.default,
          size: DOCX_STYLES.fontSizes.body,
          color: DOCX_STYLES.colors.speaker,
        }),
        new TextRun({
          text: content.length > 0 ? ` ${content}` : "",
          font: DOCX_STYLES.fonts.default,
          size: DOCX_STYLES.fontSizes.body,
        }),
      ];
    }
  }

  // No speaker pattern found, return as regular text
  return [
    new TextRun({
      text: line,
      font: DOCX_STYLES.fonts.default,
      size: DOCX_STYLES.fontSizes.body,
    }),
  ];
}

/**
 * Creates a section divider (horizontal line)
 */
function createSectionDivider(): Paragraph {
  return new Paragraph({
    border: {
      bottom: {
        color: DOCX_STYLES.colors.divider,
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    spacing: {
      before: DOCX_STYLES.spacing.medium,
      after: DOCX_STYLES.spacing.medium,
    },
  });
}

/**
 * Creates the session details heading
 */
function createSessionDetailsHeading(): Paragraph {
  return new Paragraph({
    spacing: {
      before: DOCX_STYLES.spacing.large,
      after: DOCX_STYLES.spacing.small,
    },
    children: [
      new TextRun({
        text: "Session Details",
        bold: true,
        size: DOCX_STYLES.fontSizes.heading,
        font: DOCX_STYLES.fonts.default,
        color: DOCX_STYLES.colors.heading,
      }),
    ],
  });
}

/**
 * Creates metadata table for DOCX report
 */
function createMetadataTable(metadata: ReportData["metadata"]): Table {
  const rows = metadata.map(
    (entry) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            margins: {
              top: 100,
              bottom: 100,
              left: 0,
              right: 200,
            },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.label.toUpperCase(),
                    font: DOCX_STYLES.fonts.default,
                    size: DOCX_STYLES.fontSizes.metadataLabel,
                    color: DOCX_STYLES.colors.metadataLabel,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 75, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            margins: {
              top: 100,
              bottom: 100,
              left: 0,
              right: 0,
            },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.value,
                    font: DOCX_STYLES.fonts.default,
                    size: DOCX_STYLES.fontSizes.body,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows,
  });
}

/**
 * Creates transcript heading paragraph
 */
function createTranscriptHeading(): Paragraph {
  return new Paragraph({
    spacing: {
      before: DOCX_STYLES.spacing.large,
      after: DOCX_STYLES.spacing.small,
    },
    children: [
      new TextRun({
        text: "Transcript",
        bold: true,
        size: DOCX_STYLES.fontSizes.heading,
        font: DOCX_STYLES.fonts.default,
        color: DOCX_STYLES.colors.heading,
      }),
    ],
  });
}

/**
 * Creates transcript paragraphs with speaker detection
 */
function createTranscriptParagraphs(transcriptLines: string[]): Paragraph[] {
  if (transcriptLines.length === 0) {
    return [
      new Paragraph({
        spacing: { after: DOCX_STYLES.spacing.small },
        children: [
          new TextRun({
            text: "No transcript content returned by the model.",
            italics: true,
            font: DOCX_STYLES.fonts.default,
            size: DOCX_STYLES.fontSizes.body,
            color: DOCX_STYLES.colors.metadataLabel,
          }),
        ],
      }),
    ];
  }

  return transcriptLines.map((line) =>
    line.length > 0
      ? new Paragraph({
          spacing: {
            after: DOCX_STYLES.spacing.transcriptLine,
            line: DOCX_STYLES.spacing.transcriptLineHeight,
          },
          children: parseTranscriptLine(line),
        })
      : new Paragraph({
          spacing: { after: DOCX_STYLES.spacing.transcriptParagraph },
        })
  );
}

/**
 * Creates title paragraph
 */
function createTitleParagraph(title: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: DOCX_STYLES.spacing.small },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: DOCX_STYLES.fontSizes.title,
        font: DOCX_STYLES.fonts.default,
        color: DOCX_STYLES.colors.heading,
      }),
    ],
  });
}

/**
 * Creates subtitle paragraph
 */
function createSubtitleParagraph(subtitle: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: DOCX_STYLES.spacing.medium },
    children: [
      new TextRun({
        text: subtitle,
        italics: true,
        size: DOCX_STYLES.fontSizes.subtitle,
        font: DOCX_STYLES.fonts.default,
        color: DOCX_STYLES.colors.subtitle,
      }),
    ],
  });
}

/**
 * Creates document header for continuation pages
 */
function createDocumentHeader(title: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: DOCX_STYLES.spacing.small },
        children: [
          new TextRun({
            text: title,
            font: DOCX_STYLES.fonts.default,
            size: DOCX_STYLES.fontSizes.metadataLabel,
            color: DOCX_STYLES.colors.metadataLabel,
          }),
        ],
      }),
      new Paragraph({
        border: {
          bottom: {
            color: DOCX_STYLES.colors.divider,
            space: 1,
            style: BorderStyle.SINGLE,
            size: 4,
          },
        },
        spacing: { after: DOCX_STYLES.spacing.medium },
      }),
    ],
  });
}

/**
 * Creates document footer
 */
function createDocumentFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        border: {
          top: {
            color: DOCX_STYLES.colors.divider,
            space: 1,
            style: BorderStyle.SINGLE,
            size: 4,
          },
        },
        spacing: { before: DOCX_STYLES.spacing.medium },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: DOCX_STYLES.spacing.small },
        children: [
          new TextRun({
            text: "Generated automatically by Gemini Audio Transcriber",
            italics: true,
            font: DOCX_STYLES.fonts.default,
            size: DOCX_STYLES.fontSizes.footer,
            color: DOCX_STYLES.colors.metadataLabel,
          }),
        ],
      }),
    ],
  });
}

/**
 * Writes a DOCX report to the specified path
 */
export async function writeDocxReport(
  targetPath: string,
  data: ReportData,
  fs: FileSystem
): Promise<void> {
  const doc = new Document({
    creator: "Gemini Audio Transcriber",
    title: data.title,
    subject: "Audio Transcription Report",
    description: `Transcription report for ${data.subtitle}`,
    styles: {
      default: {
        document: {
          run: {
            font: DOCX_STYLES.fonts.default,
            size: DOCX_STYLES.fontSizes.body,
            color: DOCX_STYLES.colors.text,
          },
          paragraph: { spacing: { after: DOCX_STYLES.spacing.small } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: DOCX_STYLES.margins.page,
              right: DOCX_STYLES.margins.page,
              bottom: DOCX_STYLES.margins.page,
              left: DOCX_STYLES.margins.page,
            },
          },
        },
        headers: {
          default: createDocumentHeader(data.title),
        },
        footers: {
          default: createDocumentFooter(),
        },
        children: [
          createTitleParagraph(data.title),
          createSubtitleParagraph(data.subtitle),
          createSectionDivider(),
          createSessionDetailsHeading(),
          createMetadataTable(data.metadata),
          createSectionDivider(),
          createTranscriptHeading(),
          ...createTranscriptParagraphs(data.transcriptLines),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(targetPath, buffer);
}