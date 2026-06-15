# Phase 4D — Grounded Screen Reasoning

## Purpose

Phase 4D lets Lisa answer explicit questions using the latest text produced by the manual Phase 4C OCR flow.

## Manual-Only Boundary

The operator must capture the screen and run OCR manually before requesting reasoning. Phase 4D never captures, runs OCR, polls, watches the screen, or performs desktop actions automatically.

## Privacy Model

- OCR text stays local and transient.
- Reasoning runs through the configured local Ollama model.
- OCR context is capped at 4,000 characters.
- Screen reasoning turns are not added to persisted conversation history.
- Audit events contain intent, provider, and character/line counts only.
- OCR text is treated as untrusted data, not instructions.

## Commands

- Explain: `explain what you read`
- Summarize: `summarize this screen`
- Page context: `what is this page about`
- Next steps: `what should I do next based on the screen`
- Errors: `is there an error on the screen`
- Action items: `extract action items from the screen`

## Capabilities

Lisa can summarize, explain, identify possible errors, extract action items, and suggest practical next steps based only on verified OCR text.

## Non-Capabilities

Lisa cannot infer visual layout, colors, images, controls, or other details absent from OCR. It cannot monitor continuously, act proactively, or control the desktop.

## Tests

Coverage includes prompt grounding and caps, metadata-only audits, missing-context and Local AI gates, command aliases, over-routing guards, and persistence exclusion.

## Manual Retest

Capture a screen, run `read screen text`, then try the Phase 4D commands above. Clear screen context and confirm the same commands return the deterministic no-text response.

## Release

- Commit message: `Add Phase 4D grounded screen reasoning`
- Tag: `phase-4d-grounded-screen-reasoning`
