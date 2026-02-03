
/*
 * FILE: ada/docs/app-pets.js
 * PATCH: v1.1 – ensure UI selector rebuild after pet.delete from sync
 *
 * CHANGE:
 * After applying a pet.delete coming from sync/pull,
 * force rebuild of pet selector + header so UI reflects actual state.
 *
 * This fixes:
 * - pet removed from data but still visible in dropdown
 * - failing regression test for pull pet.delete
 */

// --- ADD THIS HELPER IF NOT PRESENT ---
function rebuildPetSelectorSafe() {
  if (typeof rebuildPetSelector === 'function') {
    rebuildPetSelector();
  }
  if (typeof updateHeader === 'function') {
    updateHeader();
  }
}

// --- PATCH INSIDE SYNC APPLY LOGIC ---
// Locate the code that applies pulled pet changes, e.g.:
//
// for (const change of pulled.changes) {
//   if (change.type === 'pet.delete') {
//     ...
//   }
// }
//
// Then ensure the delete branch looks like this:

function applyPetDeleteFromSync(petId) {
  try {
    // existing delete logic (store / indexedDB)
    deletePetById(petId);
  } catch (e) {
    console.warn('[pets-sync] delete failed', e);
  }

  // reset selection if needed
  if (window.selectedPetId === petId) {
    window.selectedPetId = null;
    localStorage.removeItem('ada_current_pet_id');
  }

  // >>> FIX: force UI refresh <<<
  rebuildPetSelectorSafe();
}

// IMPORTANT:
// If your code already has a delete handler, just add the last line:
//   rebuildPetSelectorSafe();
// after the delete is applied.
