
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

/**
 * CONTRACT regression: pets delete propagation
 *
 * Stable contract:
 * - after pull pet.delete, the deleted pet is no longer present in the UI list
 */

test('Pets sync contract: pull pet.delete removes pet from UI list', async ({ page }) => {
  await login(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect.poll(async () =>
    page.evaluate(() => typeof (window as any).pullPetsIfOnline)
  ).toBe('function');

  // Create pet via stable flow
  await page.evaluate(() => (window as any).navigateToPage('addpet'));
  await page.waitForSelector('#page-addpet.active #newPetName');

  const petName = 'ContractDelete-' + Math.random().toString(16).slice(2, 6);
  await page.fill('#page-addpet.active #newPetName', petName);
  await page.selectOption('#page-addpet.active #newPetSpecies', { index: 1 });
  await page.click('button[onclick="saveNewPet()"]');

  // Go to pets page
  await page.evaluate(() => (window as any).navigateToPage('datipet'));
  await page.waitForLoadState('networkidle');

  const petId = await page.evaluate(() => localStorage.getItem('ada_current_pet_id'));
  expect(petId).toBeTruthy();

  // Mock pull delete
  await page.route('**/api/sync/pets/pull**', async (route) => {
    const body = {
      next_cursor: '999',
      device_id: 'playwright',
      changes: [{
        change_id: '999',
        type: 'pet.delete',
        pet_id: petId,
        record: null,
        version: 2,
      }],
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // Force pull
  await page.evaluate(async () => {
    await (window as any).pullPetsIfOnline({ force: true });
  });

  // Assert contract: pet name no longer appears in dropdown
  const selector = page.locator('#petSelector');
  await expect(selector).not.toContainText(petName);
});
