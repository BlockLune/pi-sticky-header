import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Install contributor hooks only in a Git checkout with development dependencies.
if (
  !process.env.CI &&
  !process.env.SKIP_INSTALL_SIMPLE_GIT_HOOKS &&
  existsSync(".git") &&
  existsSync("node_modules/simple-git-hooks")
) {
  const result = spawnSync(process.execPath, ["node_modules/simple-git-hooks/cli.js"], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}
