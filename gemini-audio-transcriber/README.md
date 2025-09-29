# Gemini Audio Transcriber

A powerful CLI tool to transcribe and diarize audio using Google Gemini models, now with **Claude Agent SDK integration** for natural language control!

## 🎯 Quick Start

### Agent Mode (New! ⭐)

Chat with Claude to transcribe your audio files naturally:

```bash
npm run interactive
```

Then simply say: `"Transcribe my audio file using the flash model"`

**[Read the full Agent Modes guide →](./AGENT_MODES.md)**

### Classic Wizard Mode

```bash
npm start
```

## Prerequisites
- Node.js 18+
- `GOOGLE_API_KEY` configured in `.env`
- `ANTHROPIC_API_KEY` configured in `.env` (for agent modes)

## Running the CLI
```
npm start
```
Follow the prompts to choose a model, audio file, speaker labels, and optional export formats (`.md`, `.docx`, `.pdf`).
Saved reports are placed in `./transcripts` using the audio filename plus a timestamp.

> **Note:** The Gemini API limits inline uploads to roughly 20MB _after_ base64 encoding. The CLI automatically stages files larger than ~15MB through the Gemini Files API (supported up to 500MB by default), so you can transcribe longer recordings without manual uploads.

To run non-interactively you can also pass an optional third argument with the desired formats:


```
npm start <model> <path-to-audio> md,pdf
```

When you need to pass CLI flags (for example `--upload-s3`), route them through `npm` with `--`:

```
npm start -- <model> <path-to-audio> md --upload-s3
```

The third argument accepts comma-separated IDs (`md`, `docx`, `pdf`) or the matching menu numbers. Omit it to print the transcription to the console only.

Pass `--upload-s3` to push generated reports to Amazon S3 (see below for configuration). Add `--no-upload-s3` to opt out when it is enabled by default.

### Cost calculator output
After each transcription finishes, the tool prints:
- Prompt, output, and total token usage returned by the Gemini API.
- Estimated dollar cost for the run, using the paid Standard tier rates from <https://ai.google.dev/gemini-api/docs/pricing>.

The current pricing table baked into the CLI assumes:
- `gemini-2.5-pro`: prompts ≤ 200k tokens (Standard tier).
- `gemini-flash-latest`: mapped to Gemini 2.5 Flash audio pricing (Standard tier).

If Google updates pricing, edit `MODEL_PRICING` in `src/config.ts`.

### Optional S3 uploads

Configure the following environment variables to enable uploads of saved reports to S3:

- `S3_UPLOAD_BUCKET` (required)
- `S3_UPLOAD_REGION` (optional, defaults to `AWS_REGION`)
- `S3_UPLOAD_PROFILE` (optional, profile to load from AWS shared config; falls back to `AWS_PROFILE`)
- `S3_UPLOAD_PREFIX` (optional key prefix, e.g. `gemini/reports`)
- `S3_UPLOAD_ACL` (optional, `public-read` or omitted for private)
- `S3_UPLOAD_DEFAULT` (optional, set to `true`/`1` to make uploads opt-out)

With the bucket configured you can either answer the wizard prompt or pass `--upload-s3` in non-interactive mode. AWS credentials must be available via the usual SDK mechanisms (environment variables, shared config, etc.).
