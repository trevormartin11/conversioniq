import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Agent worktrees carry a full repo copy — without this, their duplicate tests get swept up.
    exclude: ["**/node_modules/**", "**/.claude/**", "**/.next/**"],
  },
});
