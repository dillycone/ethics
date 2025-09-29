#!/usr/bin/env node
/**
 * Interactive conversational mode for the Audio Transcriber Agent
 */

import * as readline from 'readline';
import { query } from '@anthropic-ai/claude-code';
import ora, { Ora } from 'ora';
import { audioTranscriberServer } from './tools.js';
import { SYSTEM_PROMPT } from './agents.js';

const WELCOME_MESSAGE = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║        🎙️  Audio Transcriber Agent - Interactive Mode                    ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝

Chat with Claude to transcribe your audio files using Google Gemini models.

Type 'exit' or 'quit' to exit.

Examples:
  • "List available audio files"
  • "Transcribe sample-dialogue.mp3 using gemini-flash-latest"
  • "Show me the available models"
  • "What will it cost to transcribe a 30 minute audio file?"
  • "Save the last transcription as a PDF"
`;

export async function runInteractiveAgent(): Promise<void> {
  console.log(WELCOME_MESSAGE);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n💬 You: '
  });

  // Maintain conversation history for context continuity
  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: any }> = [];

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      process.exit(0);
    }

    if (!input) {
      rl.prompt();
      return;
    }

    console.log('\n🤖 Agent:\n');

    try {
      // Add user message to history
      conversationHistory.push({
        role: 'user',
        content: input
      });

      const response = query({
        prompt: input,
        options: {
          model: 'claude-sonnet-4-5',
          customSystemPrompt: SYSTEM_PROMPT,
          includePartialMessages: true,
          mcpServers: {
            'audio-transcriber': audioTranscriberServer
          },
          // Pre-approve all transcriber tools so they work immediately
          allowedTools: [
            'mcp__audio-transcriber__list_audio_files',
            'mcp__audio-transcriber__list_models',
            'mcp__audio-transcriber__transcribe_audio',
            'mcp__audio-transcriber__estimate_cost',
            'mcp__audio-transcriber__save_report',
            'mcp__audio-transcriber__get_transcription_text'
          ],
          // Pass conversation history for context continuity
          conversationHistory: conversationHistory.length > 1 ? conversationHistory.slice(0, -1) : undefined
        }
      });

      let assistantMessage = '';
      let spinner: Ora | null = null;

      for await (const message of response) {
        // Handle streaming events
        if (message.type === 'stream_event') {
          const event = (message as any).event;

          // Tool use started
          if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            const toolName = event.content_block.name || 'tool';
            // Create a readable name from the tool
            const readableName = toolName
              .replace('mcp__audio-transcriber__', '')
              .replace(/_/g, ' ');
            // Pause readline to prevent conflicts with spinner
            rl.pause();
            spinner = ora(`Using ${readableName}...`).start();
          }

          // Tool use finished
          if (event.type === 'content_block_stop') {
            if (spinner) {
              spinner.stop();
              spinner = null;
              // Resume readline after spinner
              rl.resume();
            }
          }

          // Text streaming - stop spinner if active
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            if (spinner) {
              spinner.stop();
              spinner = null;
              rl.resume();
            }
            process.stdout.write(event.delta.text);
            assistantMessage += event.delta.text;
          }
        }
        // Handle complete assistant messages (fallback)
        else if (message.type === 'assistant') {
          if (spinner) {
            spinner.stop();
            spinner = null;
            rl.resume();
          }
          const content = message.message.content;
          for (const block of content) {
            if (block.type === 'text') {
              // Only output if we haven't already streamed it
              if (!assistantMessage.includes(block.text)) {
                process.stdout.write(block.text);
                assistantMessage += block.text;
              }
            }
          }
        }
      }

      // Ensure spinner is stopped if still active
      if (spinner) {
        spinner.stop();
        rl.resume();
      }

      // Add assistant response to history
      if (assistantMessage) {
        conversationHistory.push({
          role: 'assistant',
          content: assistantMessage
        });
      }

      console.log('\n');
    } catch (error) {
      console.error('\n❌ Error:', error);

      if ((error as any)?.message?.includes('API key')) {
        console.log('\n💡 Make sure to set your ANTHROPIC_API_KEY environment variable.');
      }
      if ((error as any)?.message?.includes('GOOGLE_API_KEY')) {
        console.log('\n💡 Make sure to set your GOOGLE_API_KEY environment variable for Gemini transcription.');
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 Goodbye!\n');
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runInteractiveAgent().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}