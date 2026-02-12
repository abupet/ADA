import { expect, Page } from "@playwright/test";

/**
 * Robust navigation to any page using the app's global navigateToPage().
 */
export async function navigateTo(page: Page, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await page.evaluate((p: string) => (window as any).navigateToPage(p), pageName);
  await expect(page.locator(`#page-${pageName}.active`)).toBeVisible({ timeout: 10_000 });
}

/**
 * Ensure a pet is selected (create one if needed). Returns the pet_id.
 */
export async function ensurePetSelected(page: Page, name = "TestPet"): Promise<string> {
  const hasPet = await page.evaluate(() => {
    const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
    return sel && sel.value && sel.value !== "";
  });

  if (!hasPet) {
    await navigateTo(page, "addpet");
    await page.locator("#page-addpet.active #newPetName").fill(name);
    await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
    await page.locator('button[onclick="saveNewPet()"]').click();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);
  }

  return await page.evaluate(() => {
    const sel = document.getElementById("petSelector") as HTMLSelectElement;
    return sel.value;
  });
}

/**
 * Switch between veterinario / proprietario role via the toggle.
 */
export async function switchRole(page: Page, role: "veterinario" | "proprietario") {
  const current = await page.evaluate(() => (window as any).getActiveRole?.());
  if (current === role) return;

  // Use the JS API for a reliable switch
  await page.evaluate((r: string) => {
    (window as any).setActiveRole(r);
    (window as any).applyRoleUI(r);
  }, role);

  await expect.poll(async () => {
    return await page.evaluate(() => (window as any).getActiveRole?.());
  }, { timeout: 5_000 }).toBe(role);
}

/**
 * Activate super_admin role.
 */
export async function switchToSuperAdmin(page: Page) {
  await page.evaluate(() => {
    if (typeof (window as any).setActiveRoles === "function") {
      (window as any).setActiveRoles(["veterinario", "super_admin"]);
    } else {
      (window as any).setActiveRole("super_admin");
    }
    (window as any).applyRoleUI("super_admin");
  });
}

/**
 * No-op: offline sync removed in v8.15.x. Kept for API compatibility.
 */
export async function triggerSyncPush(_page: Page) {
  // no-op
}

// All navigable pages by role
export const ALL_PAGES = {
  vet: ["recording", "soap", "patient", "history", "diary", "communication", "settings"],
  owner: ["patient", "diary", "vitals", "medications", "history", "qna", "photos", "communication", "settings"],
  superAdmin: [
    "seed", "admin-dashboard", "admin-catalog", "admin-campaigns", "admin-wizard",
    "superadmin-tenants", "superadmin-users", "superadmin-policies",
    "superadmin-tags", "superadmin-audit", "superadmin-sources",
  ],
};
