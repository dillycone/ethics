/**
 * Agent mode for audio transcription using Claude Agent SDK
 */

import { query } from '@anthropic-ai/claude-code';
import type { SDKMessage } from '@anthropic-ai/claude-code';
import { audioTranscriberServer } from './tools.js';
import { SYSTEM_PROMPT } from './agents.js';

export interface TranscribeWithAgentOptions {
  prompt: string;
  model?: string;
  verbose?: boolean;
}

/**
 * Use Claude Agent to orchestrate audio transcription workflow
 */
export async function transcribeWithAgent(options: TranscribeWithAgentOptions): Promise<string> {
  const { prompt, model = 'claude-sonnet-4-5', verbose = false } = options;
  const startTime = Date.now();

  let result = '';
  let sessionId: string | undefined;

  console.log('\n🤖 Starting Claude Agent for Audio Transcription...\n');

  const response = query({
    prompt,
    options: {
      model,
      customSystemPrompt: SYSTEM_PROMPT,
      includePartialMessages: true,
      mcpServers: {
        'audio-transcriber': audioTranscriberServer
      },
      allowedTools: [
        'mcp__audio-transcriber__list_audio_files',
        'mcp__audio-transcriber__list_models',
        'mcp__audio-transcriber__transcribe_audio',
        'mcp__audio-transcriber__estimate_cost',
        'mcp__audio-transcriber__save_report',
        'mcp__audio-transcriber__get_transcription_text'
      ]
    }
  });

  for await (const message of response) {
    if (verbose) {
      console.log('Message:', JSON.stringify(message, null, 2));
    }

    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id;
      if (verbose) {
        console.log(`\n📋 Session started: ${sessionId}\n`);
      }
    }
    // Handle streaming text deltas
    else if (message.type === 'stream_event') {
      const event = (message as any).event;
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        result += event.delta.text;
        process.stdout.write(event.delta.text);
      }
    }
    // Handle complete assistant messages (fallback)
    else if (message.type === 'assistant') {
      const content = message.message.content;
      for (const block of content) {
        if (block.type === 'text') {
          // Only add if we haven't already streamed it
          if (!result.includes(block.text)) {
            result += block.text;
            process.stdout.write(block.text);
          }
        }
      }
    }
    // Handle result message with stats
    else if (message.type === 'result') {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n\n✅ Agent completed in ${duration}s`);

      if (verbose) {
        console.log(`\nSession Stats:`);
        console.log(`  Duration: ${(message.duration_ms / 1000).toFixed(2)}s`);
        console.log(`  API Time: ${(message.duration_api_ms / 1000).toFixed(2)}s`);
        console.log(`  Turns: ${message.num_turns}`);
        console.log(`  Total Cost: $${message.total_cost_usd.toFixed(4)}`);

        if (message.usage) {
          console.log(`\nToken Usage:`);
          console.log(`  Input: ${message.usage.input_tokens.toLocaleString()}`);
          console.log(`  Output: ${message.usage.output_tokens.toLocaleString()}`);
          console.log(`  Total: ${(message.usage.input_tokens + message.usage.output_tokens).toLocaleString()}`);
        }
      }
    }
  }

  return result;
}

/**
 * Quick transcription with agent - provide file path and options
 */
export async function quickTranscribe(options: {
  filePath: string;
  modelChoice?: 'gemini-2.5-pro' | 'gemini-flash-latest';
  speakers?: Array<{ label: string; description?: string }>;
  formats?: Array<'md' | 'docx' | 'pdf'>;
  uploadToS3?: boolean;
  verbose?: boolean;
}): Promise<string> {
  const {
    filePath,
    modelChoice = 'gemini-2.5-pro',
    speakers,
    formats = ['md'],
    uploadToS3 = false,
    verbose = false
  } = options;

  let prompt = `Please transcribe the audio file at '${filePath}' using the ${modelChoice} model.`;

  if (speakers && speakers.length > 0) {
    prompt += `\n\nSpeaker profiles:\n`;
    speakers.forEach((speaker, idx) => {
      prompt += `${idx + 1}. ${speaker.label}`;
      if (speaker.description) {
        prompt += ` - ${speaker.description}`;
      }
      prompt += '\n';
    });
  }

  if (formats.length > 0) {
    prompt += `\nAfter transcription, save the report in these formats: ${formats.join(', ')}`;
  }

  if (uploadToS3) {
    prompt += `\nAlso upload the reports to S3.`;
  }

  return transcribeWithAgent({ prompt, verbose });
}

/**
 * Agent-assisted workflow with interactive guidance
 */
export async function guidedTranscription(options: {
  verbose?: boolean;
} = {}): Promise<string> {
  const prompt = `Hello! I need help transcribing an audio file.

Please guide me through the process:
1. Show me the available audio files
2. Help me choose the right Gemini model
3. Transcribe the file
4. Save the transcription in an appropriate format

Let's start by showing me what audio files are available.`;

  return transcribeWithAgent({ prompt, verbose: options.verbose });
}