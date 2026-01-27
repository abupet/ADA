// smoke.force-fail.spec.ts v1
import { test, expect } from "@playwright/test";

test("@smoke FORCE FAIL (CI wiring check)", async () => {
  // Fails on purpose to verify CI(PR) failure path + PR auto-comment workflow.
  expect(true).toBe(false);
});
