<!-- ADR-PETS-PULL-MERGE.md v2 -->
# ADR — Pets Sync Pull: Normalizzazione & Merge Non Distruttivo

## Stato
APPROVATO

## Contesto
Il sistema Pets Sync è offline-first e sincronizza via push/pull. L’endpoint di pull può restituire record pet in forma **flat**
(es. `name`, `species`, `breed`, `sex`, `weight_kg`, `birthdate`). L’interfaccia utente e parte del codice locale operano invece su
una forma **nested** attesa dall’UI sotto `patient.*` (es. `patient.petName`, `patient.petSpecies`, ...).

Una regressione ha mostrato che un merge non difensivo durante il pull può sovrascrivere record locali nested con record flat,
causando perdita dei campi attesi dall’UI e degradando la visualizzazione (fallback tipo `Pet <uuid> (N/D)`).

Inoltre, la creazione offline usa ID temporanei `tmp_<uuid>` che vengono poi migrati sul server: è necessario che la parte `<uuid>` sia
sempre un UUID valido per garantire inserimenti lato server.

## Decisione
1) **Normalizzazione obbligatoria**: ogni record in ingresso dal pull deve essere normalizzato in una shape canonica che include sempre `patient.*`.
2) **Merge non distruttivo**: il merge tra record locale e record remoto normalizzato non deve mai sovrascrivere campi locali validi con valori `undefined` o `null`.
3) **Allineamento campi duplicati**: i campi duplicati (es. `name` ↔ `patient.petName`, `weight_kg` ↔ `patient.petWeight*`) devono restare coerenti.
4) **Data di nascita come fonte di verità**: l’età è derivata dalla `birthdate` e non sincronizzata come valore libero.
5) **ID temporanei compatibili server**: gli ID `tmp_...` devono contenere sempre un UUID v4 valido.

## Dettagli tecnici
- Payload flat accettato: `name`, `species`, `breed`, `sex`, `weight_kg`, `birthdate`
- Shape UI: `patient.petName`, `patient.petSpecies`, `patient.petBreed`, `patient.petSex`, `patient.petWeight`, `patient.petBirthdate`
- Derivato: `patient.petAge` calcolato da `patient.petBirthdate` (solo compatibilità prompt/UI)

## Verifica
Sono presenti test unit (Node-only) che coprono:
- Normalizzazione flat → nested
- Merge non distruttivo (remote `undefined/null`)
- Allineamento `name` ↔ `patient.petName` e peso
- Sincronizzazione `birthdate` ↔ `patient.petBirthdate`
