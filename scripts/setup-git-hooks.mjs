import { spawnSync } from "node:child_process";

if (process.env.OPENCLAW_DISABLE_GIT_HOOKS) {
  process.exit(0);
}

function runGit(args) {
  return spawnSync("git", args, {
    stdio: "ignore",
    windowsHide: true,
  });
}

const inRepo = runGit(["rev-parse", "--is-inside-work-tree"]);
if (inRepo.error || inRepo.status !== 0) {
  process.exit(0);
}

const configureHooks = runGit(["config", "core.hooksPath", "git-hooks"]);
if (configureHooks.error || configureHooks.status !== 0) {
  process.exit(0);
}
