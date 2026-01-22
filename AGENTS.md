# ADA – Agent Instructions

This file defines how automated agents (Codex) must work on ADA.

---

## Architecture Overview

Main files:
- index.html → UI
- app-core.js → core logic, text upload
- app-recording.js → audio recording, upload, chunking
- app-soap.js → SOAP generation
- RELEASE_NOTES.md → cumulative release notes (ONLY ONE FILE)

---

## Critical Areas

### app-recording.js
- Controls microphone
- Controls audio uploads
- Controls long-audio test chunking
- If this file fails to load, multiple buttons will silently stop working.

ALWAYS run a syntax check before committing changes.

---

## Mandatory Manual Smoke Tests

After ANY change, verify manually:

### Visita page
- 🎤 Microphone toggles correctly
- 📁 Carica audio opens file picker and starts processing
- 🧪 Carica audio lungo (test chunking):
  - Handles files >25MB using valid chunking
  - Does NOT slice WebM/MP4 by bytes
- 🧪 Carica testo lungo (test append) appends text progressively
- 📄 Carica testo works

### Debug
- Enable "Debug attivo (per i test)"
- Check ADA.log for:
  - clear errors
  - no infinite loops
  - no silent failures

---

## Release Notes Policy

- Update RELEASE_NOTES.md for every change.
- Add a new section:
  ## vX.Y.Z
- Describe:
  - bug fixes
  - behavioral changes
  - known limitations

DO NOT create:
- RELEASE_NOTES_vX.md
- changelog copies
- duplicated note files

---

## Known Constraints

- OpenAI transcription upload limit: 25MB
- Long audio must be chunked safely
- UI must remain usable even when debug tools are enabled
