import { test as base, expect } from "@playwright/test";
import { blockOpenAI } from "./block-openai";
import { applyStrictNetwork } from "./strict-network";

/**
 * Test base per smoke/regression/local:
 * - Se STRICT_NETWORK=1: blocca rete esterna non allowlisted
 * - Se ALLOW_OPENAI!=1: mock/blocco OpenAI
 *
 * The beforeEach is attached via a fixture auto-init so it runs inside
 * every test that imports this module, without calling test.beforeEach()
 * at the module level (which breaks `--list` and config-time resolution).
 */
export const test = base.extend<{ _autoSetup: void }>({
  _autoSetup: [async ({ page }, use) => {
    // 1) STRICT first: block unknown external calls early
    await applyStrictNetwork(page);

    // 2) OpenAI mock (unless ALLOW_OPENAI=1)
    await blockOpenAI(page);

    await use();
  }, { auto: true }],
});

export { expect };
