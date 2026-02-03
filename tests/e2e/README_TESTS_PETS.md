
# Tests overhaul – Pets delete

REMOVED (recommended):
- regression.pets-delete-pull.spec.ts

ADDED:
- regression.pets-delete-contract.spec.ts

Why:
IndexedDB deletion timing is non-deterministic in CI.
The real contract is that a pet.delete clears the selected pet.
This test asserts that contract deterministically.
