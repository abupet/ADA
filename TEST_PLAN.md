# ADA — Piano Test Manuale

## Baseline
Versione: v7.2.1

---

## Test 1 — Registrazione: pulsanti obbligatori
- Apri la pagina Registrazione (come Veterinario)
- Clicca ogni pulsante:
  - Microfono
  - Carica audio
  - Carica audio lungo (test)
  - Carica testo lungo (test)
  - Carica testo
- **Atteso:** tutti i pulsanti rispondono senza errori console

---

## Test 2 — Toggle Ruolo
- Clicca il toggle nell'header per passare da Veterinario a Proprietario
- **Atteso:**
  - La sidebar cambia (sezione Visita vs sezione I Miei Amici Animali)
  - Le pagine vietate per il ruolo non sono raggiungibili
  - Il toggle persiste dopo refresh (localStorage)

---

## Test 3 — Route Guard
- Come Proprietario, esegui nella console: `navigateToPage('recording')`
- **Atteso:** redirect alla home Proprietario, toast "Pagina non disponibile"
- Come Veterinario, esegui: `navigateToPage('diary')`
- **Atteso:** redirect alla home Veterinario, toast "Pagina non disponibile"

---

## Test 4 — Upload Documenti + Badge
- Vai ad Archivio Sanitario
- Clicca "Carica Documento"
- Carica un file valido (PDF/JPG/PNG, < 10 MB)
- **Atteso:**
  - Toast conferma upload
  - Documento appare nella lista
  - Il badge numerico nella sidebar si aggiorna includendo il nuovo documento
  - Click sul documento apre il viewer

---

## Test 5 — Document Viewer
- Apri un PDF caricato → **Atteso:** PDF renderizzato in iframe
- Apri un'immagine caricata → **Atteso:** immagine con zoom e fullscreen

---

## Test 6 — Document AI (richiede OpenAI key)
- Come Veterinario, apri un documento e clicca "Leggi"
- **Atteso:** interpretazione AI, il testo inizia correttamente (nessuna sillaba tagliata)
- Come Proprietario, apri un documento e clicca "Spiegami il documento"
- **Atteso:** spiegazione semplificata, tono "il team Abupet"
- Come Proprietario, il pulsante "Leggi" è disabilitato

---

## Test 7 — SOAP: Generazione e Salvataggio
- Come Veterinario, genera un referto SOAP da trascrizione
- Espandi "Note interne (non stampate)" e scrivi del testo
- Clicca "Salva"
- **Atteso:**
  - Referto appare in Archivio Sanitario
  - I campi "Dati clinici specialistici" e "Checklist" NON sono visibili
  - Le "Note interne" sono visibili e salvate
- Clicca il referto nell'archivio → si apre nella pagina SOAP con le note interne ripristinate

---

## Test 8 — SOAP: Vista Read-Only per Proprietario
- Come Proprietario, vai ad Archivio Sanitario
- Clicca su un referto SOAP
- **Atteso:**
  - Si apre la pagina "Referto" in formato read-only (bella formattazione, intestazione blu, sezioni S/O/A/P colorate)
  - NON si viene rimandati a "Dati Pet"
  - Le "Note interne" NON sono visibili
  - Il pulsante "Spiegami il documento" è visibile
  - Come Veterinario, lo stesso referto si apre nella vista SOAP editabile

---

## Test 9 — SOAP: Spiegazione con tono "team Abupet" (richiede OpenAI key)
- Come Proprietario, nella vista read-only clicca "Spiegami il documento"
- **Atteso:**
  - Spiegazione semplice e professionale
  - Firma: "Il team Abupet" (non il veterinario in prima persona)
- Come Veterinario, nella pagina SOAP il pulsante "Spiegami il documento" NON è visibile

---

## Test 10 — SOAP: Esportazione PDF/TXT
- Genera un referto SOAP con note interne compilate
- Clicca PDF e TXT
- **Atteso:**
  - Il PDF e il TXT contengono solo S, O, A, P
  - Le "Note interne" NON compaiono nel file esportato

---

## Test 11 — Sync Offline
- Crea un pet "Alfa"
- Vai offline (DevTools → Network → Offline)
- Cambia il nome in "AlfaAlfa", salva
- Torna online
- **Atteso:**
  - Il dropdown mostra "AlfaAlfa (Cane)" (non il vecchio nome)
  - Il campo Nome mostra "AlfaAlfa"
  - Dopo qualche secondo il sync avviene (push poi pull)
  - Ricaricando la pagina il nome resta "AlfaAlfa"

---

## Test 12 — Audio Export: naming file
- Registra almeno 2 chunk audio per un pet di nome "Fido"
- Esporta gli audio (pulsante export nella pagina Debug)
- **Atteso:**
  - Lo ZIP si chiama `Fido_audio_<datetime>.zip`
  - I file dentro si chiamano `Fido+<datetime>+chunk_0001.webm` (o .mp4)

---

## Test 13 — Promo Slot
- Vai a Dati Pet con un pet selezionato
- **Atteso:** se il backend restituisce una raccomandazione, il promo appare
- Clicca "Non mi interessa" → card dismiss

---

## Test 14 — Inline Loading
- Avvia un'operazione lunga (es. generazione SOAP)
- **Atteso:**
  - Spinner inline (no overlay fullscreen)
  - Messaggi timer aggiornati (0–3s, 4–10s, 11–20s)
  - Dopo 20s: pulsante "Riprova"
  - Dopo 45s: auto-abort

---

## Test 15 — Debug Mode
- In Impostazioni, attiva "Debug attivo"
- **Atteso:** "Debug" appare nella sidebar, strumenti debug visibili
- Disattiva → "Debug" scompare dalla sidebar

---

## Test 16 — Appointment (rimosso)
- Naviga a un vecchio URL/bookmark dell'appuntamento
- **Atteso:** redirect alla home, nessun errore

---

## Test 17 — Security
- Carica un file .exe rinominato in .pdf
- **Atteso:** rifiutato dalla validazione MIME magic bytes
- Prova ad accedere via API al documento di un altro utente
- **Atteso:** 404 (isolamento tenant)

---

## Test 18 — Long Audio
- Carica un WebM > 25 MB
- **Atteso:** chunking corretto, nessun "Audio file corrupted", nessun loop infinito
