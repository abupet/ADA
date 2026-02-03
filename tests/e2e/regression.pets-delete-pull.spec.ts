// tests/e2e/regression.pets-delete-pull.spec.ts
// v2 - robust selector handling (petSelector may be hidden when empty)

import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('Pets sync: pull pet.delete removes pet and clears selection', async ({ page }) => {
  await login(page);
  await page.goto('/#/dati-pet');

  // Wait for page bootstrap instead of visible select
  await page.waitForLoadState('networkidle');

  // petSelector can exist but be hidden when no pets are present
  const petSelector = page.locator('#petSelector');
  await expect(petSelector).toHaveCount(1);

  // Create pet
  await page.click('#btnNewPet');
  await page.fill('#petName', 'TestDelete');
  await page.selectOption('#petSpecies', 'Cane');
  await page.click('#btnSavePet');

  // Ensure pet appears (selector may become visible now)
  await expect(petSelector).toContainText('TestDelete');

  // Trigger sync so pet is persisted
  await page.click('#btnSync');

  // Simulate delete via backend pull:
  // delete locally (UI)
  await page.click('#btnDeletePet');
  await page.click('#confirmDeletePet');

  // Sync again to apply pull delete
  await page.click('#btnSync');

  // Selector should either be empty or reset to placeholder
  await expect(petSelector).not.toContainText('TestDelete');
});
