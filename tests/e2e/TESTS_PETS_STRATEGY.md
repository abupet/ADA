# E2E test strategy update (pets)

## What changed
- Added helpers to avoid brittle UI selectors for Pets tests: `tests/e2e/helpers/pets.ts`.
- Updated `regression.pets-delete-pull.spec.ts` to be deterministic and not rely on `#btnNewPet` (which is not present in the docs-based UI).

## Rationale
In the docs-based UI, many controls exist but can be hidden depending on state.
Regression tests must validate logic, not presentation.

## How the delete test works now
- Creates a pet via the stable AddPet page (same path used by smoke test).
- Mocks push to accept.
- Mocks pull to return a `pet.delete` for that pet id.
- Forces pull via `window.pullPetsIfOnline({force:true})`.
- Asserts:
  - localStorage `ada_current_pet_id` cleared
  - pet removed from IndexedDB `ADA_Pets.pets`

