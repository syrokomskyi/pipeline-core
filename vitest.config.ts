/*
<MODULE_CONTRACT>
<purpose>Configure Vitest for TypeScript project testing</purpose>
<non-goals>
  <item>Provide test case implementations</item>
  <item>Handle test result reporting</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial configuration setup for Vitest</item>
</CHANGE_SUMMARY>
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["@syrokomskyi/source"],
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
