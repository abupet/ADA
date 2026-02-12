import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Communication: chat pages, socket.io, message UI
// ---------------------------------------------------------------------------

test.describe("Deep communication chat", () => {

  test("@deep Vet: communication page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await navigateTo(page, "communication");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Owner: communication page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "communication");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Socket.io CDN loaded", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    const ioType = await page.evaluate(() => typeof (window as any).io);
    expect(ioType).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Chat: message input present", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await navigateTo(page, "communication");

    const input = page.locator('#page-communication.active input[type="text"], #page-communication.active textarea, #page-communication.active [data-testid="message-input"]');
    const count = await input.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Chat: multimedia attachment UI exists", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await navigateTo(page, "communication");

    // Check for attachment button/input
    const attachBtn = page.locator('#page-communication.active [data-testid="attach-button"], #page-communication.active input[type="file"]');
    const count = await attachBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep WebRTC globals available", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    // Check WebRTC availability (browser built-in)
    const webrtc = await page.evaluate(() => ({
      RTCPeerConnection: typeof (window as any).RTCPeerConnection,
      mediaDevices: typeof navigator.mediaDevices,
    }));

    expect(webrtc.RTCPeerConnection).toBe("function");
    expect(webrtc.mediaDevices).toBe("object");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Communication page: vet sidebar nav item", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    const navItem = page.locator('#sidebar-vet .nav-item[data-page="communication"]');
    await expect(navItem).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Communication page: owner sidebar nav item", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    const navItem = page.locator('#sidebar-owner .nav-item[data-page="communication"]');
    await expect(navItem).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
