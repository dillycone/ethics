import { writeDocxReport } from "./src/reports/docx.js";
import { NodeFileSystem } from "./src/utils/filesystem.js";
import { ReportData } from "./src/types.js";

const mockReportData: ReportData = {
  title: "Transcription Report",
  subtitle: "sample-dialogue.mp3",
  metadata: [
    { label: "Source File", value: "sample-dialogue.mp3" },
    { label: "Model", value: "gemini-2.5-pro" },
    { label: "Generated", value: new Date().toLocaleString() },
    { label: "Speakers", value: "Alice (Customer); Bob (Support Agent)" },
    { label: "Prompt Tokens", value: "12,845" },
    { label: "Output Tokens", value: "3,291" },
    { label: "Total Tokens", value: "16,136" },
    { label: "Estimated Cost", value: "$0.04896 (input $0.01606, output $0.03291)" },
  ],
  transcriptLines: [
    "Speaker 1: Hello, I'm having trouble with my account login. Can you help me?",
    "",
    "Speaker 2: Of course! I'd be happy to help you with that. Can you tell me what error message you're seeing?",
    "",
    "Speaker 1: It says 'Invalid credentials' but I know my password is correct.",
    "",
    "Speaker 2: I understand how frustrating that can be. Let me check your account status. Can I have your email address?",
    "",
    "Speaker 1: Sure, it's alice.customer@example.com",
    "",
    "Speaker 2: Thank you, Alice. I'm looking at your account now. It appears there was a security lockout triggered after multiple failed login attempts. I can reset that for you.",
    "",
    "Speaker 1: Oh, I wasn't aware of that. Yes, please reset it.",
    "",
    "Speaker 2: Done! You should receive a password reset email within the next few minutes. Is there anything else I can help you with today?",
    "",
    "Speaker 1: No, that's perfect. Thank you so much for your help!",
    "",
    "Speaker 2: You're very welcome! Have a great day, Alice.",
  ],
};

const fs = new NodeFileSystem();
const outputPath = "./transcripts/test-enhanced-output.docx";

async function testDocxOutput() {
  try {
    await writeDocxReport(outputPath, mockReportData, fs);
    console.log(`✅ Test DOCX file created successfully at: ${outputPath}`);
    console.log("\nFeatures to look for when you open the file:");
    console.log("  ✓ Professional centered title and subtitle");
    console.log("  ✓ Horizontal divider lines between sections");
    console.log("  ✓ 'Session Details' heading");
    console.log("  ✓ Metadata displayed in aligned table format");
    console.log("  ✓ Speaker labels (e.g., 'Speaker 1:') in bold blue");
    console.log("  ✓ Enhanced line spacing in transcript");
    console.log("  ✓ Professional footer on every page");
    console.log("  ✓ Document properties (visible in File → Properties)");
  } catch (error) {
    console.error("❌ Error creating test DOCX:", error);
  }
}

testDocxOutput();