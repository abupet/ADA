<!-- ADR-PETS-PULL-MERGE.md v1 -->
# ADR — Pets Sync Pull: Normalizzazione & Merge Non Distruttivo

## Stato
APPROVATO

## Contesto
Il sistema Pets Sync è offline-first e sincronizza via push/pull. L'endpoint di pull può restituire record pet in forma **flat** (es. `name`, `species`, `breed`, `sex`, `weight_kg`). L'interfaccia utente e parte del codice locale operano invece su una forma **nested** dove i principali campi clinici sono presenti sotto `patient.*` (es. `patient.petName`, `patient.petSpecies`, ...).

Una regressione ha mostrato che un merge non difensivo durante il pull può sovrascrivere record locali nested con record flat, causando perdita dei campi attesi dall'UI e degradando la visualizzazione (fallback tipo `Pet <uuid> (N/D)`).

## Decisione
1) **Normalizzazione obbligatoria**: ogni record in ingresso dal pull deve essere normalizzato in una shape canonica che include sempre `patient.*` coerente, anche se il payload backend è flat.
2) **Merge non distruttivo**: il merge tra record locale e record remoto normalizzato non deve mai cancellare dati locali validi con valori `undefined` o `null` provenienti dal remoto.
3) **Allineamento campi duplicati**: i campi duplicati (es. `name` e `patient.petName`) devono restare coerenti. Se uno dei due è valorizzato e l'altro no, il sistema li riallinea.
4) **Backend libero di restare flat**: il backend può continuare a inviare record flat; la resilienza in scenari offline-first richiede comunque normalizzazione e merge robusto lato frontend.

## Dettagli tecnici
### Shape canonica (frontend)
- Campi flat accettati: `name`, `species`, `breed`, `sex`, `weight_kg`
- Campi nested richiesti dalla UI: `patient.petName`, `patient.petSpecies`, `patient.petBreed`, `patient.petSex`, `patient.petWeightKg`

Regola: se i campi flat sono presenti e `patient.*` è assente o incompleto, valorizzare `patient.*` usando i valori flat.

### Regola di merge
Per ogni campo di dominio (name/species/breed/sex/weight):
- Se il valore remoto è **definito** (non `undefined` e non `null`), può aggiornare il locale.
- Se il valore remoto è `undefined` o `null`, preservare il valore locale esistente.

### Allineamento name ↔ patient.petName
Dopo normalizzazione e merge:
- `name` deve essere uguale a `patient.petName` (stesso valore).

## Verifica
È presente un test unit anti-regressione che copre:
- Normalizzazione flat → nested
- Merge non distruttivo (remote `undefined/null`)
- Allineamento coerente `name` ↔ `patient.petName`

## Note operative
Se in futuro si decide di cambiare il payload backend verso una shape nested, la normalizzazione frontend può essere mantenuta come compatibilità retroattiva o semplificata. Il merge non distruttivo resta obbligatorio in un sistema offline-first.
