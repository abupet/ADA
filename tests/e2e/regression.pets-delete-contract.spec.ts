
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

/**
 * Regression (Pets): apply pull pet.delete
 *
 * Key point:
 * - We DO NOT use Playwright route matching (fetchApi may use absolute URLs / prefixes).
 * - We monkeypatch window.fetchApi so the app *definitely* receives our mocked pull.
 */

test('Pets sync: pull pet.delete removes pet from selector options', async ({ page, context }) => {
  await login(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Ensure runtime functions exist
  await expect.poll(async () =>
    page.evaluate(() => typeof (window as any).pullPetsIfOnline)
  ).toBe('function');

  // Create a pet using stable flow (same as smoke)
  await page.evaluate(() => (window as any).navigateToPage('addpet'));
  await page.waitForSelector('#page-addpet.active #newPetName');

  const petName = 'RegDel-' + Math.random().toString(16).slice(2, 6);
  await page.fill('#page-addpet.active #newPetName', petName);
  await page.selectOption('#page-addpet.active #newPetSpecies', { index: 1 });
  await page.click('button[onclick="saveNewPet()"]');

  // Move to pets page so selector exists
  await page.evaluate(() => (window as any).navigateToPage('datipet'));
  await page.waitForLoadState('networkidle');

  const petId = await page.evaluate(() => localStorage.getItem('ada_current_pet_id'));
  expect(petId).toBeTruthy();

  // Monkeypatch fetchApi so pull returns pet.delete for that petId
  await page.evaluate((id) => {
    const w = window as any;
    const orig = w.fetchApi;
    w.__pw_mock_pets_delete_id = id;

    w.fetchApi = async function(url: any, opts: any) {
      const u = String(url || '');
      if (u.includes('/api/sync/pets/pull')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              next_cursor: '999',
              device_id: 'playwright',
              changes: [{
                change_id: '999',
                type: 'pet.delete',
                pet_id: w.__pw_mock_pets_delete_id,
                record: null,
                version: 2,
              }],
            };
          },
        };
      }
      return orig ? orig(url, opts) : fetch(url, opts);
    };
  }, petId);

  // Force pull
  await page.evaluate(async () => {
    await (window as any).pullPetsIfOnline({ force: true });
  });

  // Contract: pet name should not be present in selector's text
  const selector = page.locator('#petSelector');
  await expect(selector).toHaveCount(1);
  await expect(selector).not.toContainText(petName);
});
