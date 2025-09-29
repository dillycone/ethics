# Gemini Audio Transcriber

## Prerequisites
- Node.js 18+
- `GOOGLE_API_KEY` configured in `.env`

## Running the CLI
```
npm start
```
Follow the prompts to choose a model, audio file, speaker labels, and optional export formats (`.md`, `.docx`, `.pdf`).
Saved reports are placed in `./transcripts` using the audio filename plus a timestamp.

To run non-interactively you can also pass an optional third argument with the desired formats:

```
npm start <model> <path-to-audio> md,pdf
```

The third argument accepts comma-separated IDs (`md`, `docx`, `pdf`) or the matching menu numbers. Omit it to print the transcription to the console only.

### Cost calculator output
After each transcription finishes, the tool prints:
- Prompt, output, and total token usage returned by the Gemini API.
- Estimated dollar cost for the run, using the paid Standard tier rates from <https://ai.google.dev/gemini-api/docs/pricing>.

The current pricing table baked into the CLI assumes:
- `gemini-2.5-pro`: prompts ≤ 200k tokens (Standard tier).
- `gemini-flash-latest`: mapped to Gemini 2.5 Flash audio pricing (Standard tier).

If Google updates pricing, edit `MODEL_PRICING` in `src/index.ts`.
