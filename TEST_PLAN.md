# ADA — Manual Test Plan

## Baseline
Version under test: v7.0.0

---

## Test 1 — Registrazione Buttons
- Open Registrazione page
- Click each button:
  - Microphone
  - Carica audio
  - Carica audio lungo (test)
  - Carica testo lungo (test)
  - Carica testo
- Expected: all buttons respond

---

## Test 2 — Role Toggle
- Toggle role from Veterinario to Proprietario in header
- Expected:
  - Sidebar changes (Visita section vs I Miei Amici Animali section)
  - Pages restricted by role redirect to role's home page
  - Toggle persists across page refresh (localStorage)

---

## Test 3 — Route Guard
- As Proprietario, attempt to navigate to "recording" page
- Expected: redirect to Proprietario home page
- As Veterinario, attempt to navigate to "diary" page
- Expected: redirect to Veterinario home page

---

## Test 4 — Document Upload
- Navigate to Archivio Sanitario
- Click "Carica Documento"
- Upload a valid PDF/JPG/PNG (under 10 MB)
- Expected:
  - Toast confirms upload success
  - Document appears in history list
  - Clicking opens document viewer page

---

## Test 5 — Document Viewer
- Open an uploaded PDF
- Expected: PDF renders in iframe with download link
- Open an uploaded image
- Expected: image renders with click-to-zoom and fullscreen overlay

---

## Test 6 — Document AI (requires OpenAI key)
- As Veterinario, open a document and click "Leggi"
- Expected: AI interpretation appears, inline loader shows progress
- As Proprietario, open same document and click "Genera Spiegazione"
- Expected: simplified explanation appears
- As Proprietario, "Leggi" button is disabled
- As Veterinario, "Genera Spiegazione" button is disabled

---

## Test 7 — Sync Engine
- Create/edit a pet while online
- Expected: data syncs to backend
- Edit a pet offline, then reconnect
- Expected: outbox drains and data syncs

---

## Test 8 — Promo Slot
- Navigate to Dati Pet page with a pet selected
- Expected: if backend returns a recommendation, promo card appears
- Click "Non mi interessa" on promo card
- Expected: card dismissed, event tracked

---

## Test 9 — Inline Loading
- Trigger a long operation (e.g., SOAP generation)
- Expected:
  - Spinner appears inline (no fullscreen overlay)
  - Timer messages update (0–3s, 4–10s, 11–20s)
  - After 20s, "Riprova" button appears
  - After 45s, auto-abort

---

## Test 10 — Debug Mode
- Enable Debug attivo in Impostazioni
- Expected:
  - "Debug" appears in sidebar
  - ADA.log is verbose
  - Debug tools visible on debug page
- Disable Debug attivo
- Expected: Debug sidebar item disappears

---

## Test 11 — Appointment Removal
- Navigate to old "appointment" URL/bookmark
- Expected: redirect to home page (no error)
- Check sidebar: no "Appuntamento" entry in either role

---

## Test 12 — Long Audio
- Upload a WebM > 25MB
- Expected:
  - No "Audio file corrupted"
  - Chunking is time-based
  - No infinite loops

---

## Test 13 — Security
- Attempt to upload a non-allowed file type (e.g., .exe renamed to .pdf)
- Expected: rejected by MIME magic bytes validation
- Attempt to access another user's document via API
- Expected: 404 (tenant isolation)
