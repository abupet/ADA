# Next task prompt (remaining work)

You are continuing ADA Offline Pets work. Remaining scope after Step 8 (persistent outbox op_uuid) is to implement **STEP 7: tmp_id → server_id mapping + local migration**.

## Goals
- Bump IndexedDB version in `docs/app-pets.js` from 2 → 3 and add an `id_map` store (`keyPath: 'tmp_id'`).
- Add helpers:
  - `getMappedServerId(tmpOrId)` to resolve `tmp_` ids using `id_map`, falling back to deterministic `tmp_` stripping.
  - `persistIdMapping(tmp_id, server_id)` to upsert into `id_map`.
  - `migratePetId(tmp_id, server_id)` to move records from `pets` store and update `localStorage.ada_current_pet_id`.
- Update `applyRemotePets(items)` to:
  - Detect local `tmp_<uuid>` when server returns `<uuid>`.
  - Migrate `tmp_<uuid>` to `<uuid>` before upsert.
  - Ensure stored `id` is the server id.
- Update any selection logic so UI keeps working after migration.
- In `docs/pets-sync-step4.js`, after accepted ops cleanup:
  - For accepted ops tied to `pet_local_id` starting with `tmp_`, persist mapping and migrate the local record.

## Constraints
- Keep changes localized to existing files.
- No new dependencies, keep silent error handling consistent with current style.
- Keep IDB upgrade backwards compatible.

## Testing expectations
- Offline create pet → pets store uses tmp_*.
- Online push → outbox emptied; tmp_* migrated to uuid; `id_map` entry exists.
- Updates after migration use uuid (not tmp_).
