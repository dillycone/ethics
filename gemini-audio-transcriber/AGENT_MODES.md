# Claude Agent Modes for Audio Transcription

The Gemini Audio Transcriber now supports **Claude Agent SDK** integration, allowing you to transcribe audio files using natural language through Claude AI.

## 🚀 Quick Start

### Prerequisites

Set up your environment variables in `.env`:

```bash
# Required for Claude Agent modes
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Required for transcription (all modes)
GOOGLE_API_KEY=your_google_api_key_here

# Optional: S3 upload configuration
S3_UPLOAD_BUCKET=your-bucket-name
S3_UPLOAD_REGION=us-east-1
S3_UPLOAD_PREFIX=transcripts/
```

## 📋 Available Modes

### 1. Interactive Agent Mode (Recommended)

Chat with Claude to transcribe your audio files conversationally.

```bash
npm run interactive
```

**Example conversation:**
```
💬 You: List available audio files
🤖 Agent: [Shows audio files in audio/ directory]

💬 You: Transcribe sample-dialogue.mp3 using gemini-flash-latest
🤖 Agent: [Transcribes the file and shows preview]

💬 You: Save it as a PDF
🤖 Agent: [Saves the transcription to PDF]
```

**Features:**
- Natural language commands
- Conversation history for context
- Step-by-step guidance
- Cost transparency

### 2. Guided Agent Mode

Claude guides you through the entire transcription workflow automatically.

```bash
npm run agent
```

Claude will:
1. Show available audio files
2. Help you choose the right model
3. Execute transcription
4. Suggest appropriate output formats

**With verbose output:**
```bash
npm run agent:verbose
```

### 3. Quick Agent Mode

Transcribe a specific file quickly using the agent.

```bash
npm start -- --agent-file audio/my-audio.mp3 --model gemini-2.5-pro
```

**Options:**
- `--agent-file <path>` - Path to audio file
- `--model <model>` - Gemini model (default: gemini-2.5-pro)
- `--verbose` - Show detailed execution info

### 4. Classic Modes (Preserved)

The original modes still work exactly as before:

**Wizard Mode:**
```bash
npm start
```

**Direct Mode:**
```bash
npm start gemini-2.5-pro audio/sample.mp3 md,pdf
```

## 🛠️ Available Agent Tools

The Claude agent has access to these tools:

### `list_audio_files`
Shows all audio files in the `audio/` directory.

### `list_models`
Displays available Gemini models with recommendations.

### `transcribe_audio`
Transcribes and diarizes an audio file using Gemini.

**Parameters:**
- `filePath` - Path to audio file
- `modelChoice` - Gemini model (`gemini-2.5-pro` or `gemini-flash-latest`)
- `speakers` - Optional speaker profiles for better diarization

### `estimate_cost`
Estimates transcription costs before processing.

**Parameters:**
- `modelChoice` - Gemini model
- `audioLengthMinutes` - Optional audio duration

### `save_report`
Saves transcription in various formats.

**Parameters:**
- `formats` - Array of formats (`md`, `docx`, `pdf`)
- `uploadToS3` - Upload to S3 (requires config)

### `get_transcription_text`
Retrieves the full text of the last transcription.

## 💡 Example Use Cases

### Use Case 1: Quick Transcription with Natural Language

```bash
npm run interactive
```
```
You: I have a 30-minute interview. What will it cost to transcribe?
Agent: [Shows cost estimate for both models]

You: Use the flash model, it's cheaper. Transcribe interview.mp3
Agent: [Transcribes and shows preview]

You: Perfect! Save as markdown and upload to S3
Agent: [Saves and uploads]
```

### Use Case 2: Batch Processing Guidance

```bash
npm run agent
```

Claude will automatically:
- List all audio files
- Recommend optimal model based on your needs
- Process files efficiently
- Suggest cost-effective strategies

### Use Case 3: Speaker Diarization

```bash
npm run interactive
```
```
You: Transcribe podcast.mp3 with speaker labels.
     Speaker 1 is "Dr. Smith" (the host),
     Speaker 2 is "Jane Doe" (the guest)
Agent: [Transcribes with accurate speaker labels]
```

## 🎯 Model Recommendations

### gemini-2.5-pro
- **Best for:** High accuracy, complex audio, multiple speakers
- **Cost:** $1.25/1M input tokens, $10/1M output tokens
- **Use when:** Quality is critical

### gemini-flash-latest
- **Best for:** Quick transcription, simple audio, cost-sensitive projects
- **Cost:** $1.00/1M input tokens, $2.50/1M output tokens
- **Use when:** Speed and cost matter more than perfection

## 📊 Cost Transparency

The agent automatically shows:
- Token usage for each transcription
- Estimated costs
- Model pricing comparison
- Cost-saving recommendations

Example output:
```
Token Usage:
  - Input tokens: 123,456
  - Output tokens: 45,678
  - Total tokens: 169,134

Estimated Cost:
  - Input: $0.15
  - Output: $0.46
  - Total: $0.61
```

## 🔧 Architecture

### Files Added

- `src/tools.ts` - MCP tool definitions for audio transcription
- `src/agents.ts` - System prompts and agent guidance
- `src/agent-mode.ts` - Programmatic agent interface
- `src/interactive-agent.ts` - Interactive conversational mode

### Integration Pattern

```typescript
import { query } from '@anthropic-ai/claude-code';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-code';

// Define tools
const server = createSdkMcpServer({
  name: 'audio-transcriber',
  tools: [/* tool definitions */]
});

// Use with agent
const response = query({
  prompt: userInput,
  options: {
    mcpServers: { 'audio-transcriber': server },
    allowedTools: [/* tool names */]
  }
});
```

## 🐛 Troubleshooting

### "ANTHROPIC_API_KEY is not set"
Add your API key to `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### "GOOGLE_API_KEY is not set"
The transcription still uses Google Gemini. Add to `.env`:
```bash
GOOGLE_API_KEY=...
```

### S3 Upload Not Working
Ensure S3 configuration in `.env`:
```bash
S3_UPLOAD_BUCKET=your-bucket
S3_UPLOAD_REGION=us-east-1
```

### No Audio Files Found
Create the `audio/` directory and add supported audio files:
```bash
mkdir -p audio
cp your-audio.mp3 audio/
```

## 📚 Additional Resources

- [Claude Agent SDK Documentation](https://docs.claude.com/en/docs/claude-code/sdk/sdk-overview)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

## 🎨 Tips & Best Practices

1. **Start with Interactive Mode** - It's the easiest way to learn the workflow
2. **Use Cost Estimates** - Check costs before processing long audio files
3. **Provide Speaker Info** - Improves diarization accuracy significantly
4. **Choose the Right Model** - Use Flash for drafts, Pro for final transcriptions
5. **Save Multiple Formats** - Generate MD for quick review, PDF for sharing
6. **Leverage S3 Upload** - Automatically backup and share transcriptions

## 🤝 Comparison with Classic Mode

| Feature | Classic Wizard | Agent Mode |
|---------|---------------|------------|
| Ease of Use | Structured prompts | Natural language |
| Flexibility | Predefined workflow | Adaptive to needs |
| Cost Visibility | Manual calculation | Automatic estimates |
| Guidance | Step-by-step wizard | Conversational AI |
| Best For | One-time transcription | Exploring options |

**Both modes use the same underlying Gemini transcription engine!**