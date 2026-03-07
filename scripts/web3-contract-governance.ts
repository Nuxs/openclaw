import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWeb3ContractSnapshot,
  collectGovernanceIssues,
  compareSnapshots,
  formatIssues,
  readCommittedWeb3ContractSnapshot,
  writeWeb3ContractSnapshot,
  WEB3_CONTRACT_SNAPSHOT_PATH,
} from "../src/web3-contracts/governance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

if (checkOnly && args.has("--write")) {
  console.error("Use either --check or --write, not both.");
  process.exit(1);
}

async function main() {
  const snapshot = await buildWeb3ContractSnapshot(repoRoot);
  const governanceIssues = collectGovernanceIssues(snapshot);

  if (checkOnly) {
    const committed = await readCommittedWeb3ContractSnapshot(repoRoot);
    const snapshotIssues = compareSnapshots(committed, snapshot);
    const issues = [...governanceIssues, ...snapshotIssues];
    if (issues.length === 0) {
      console.log(`OK ${WEB3_CONTRACT_SNAPSHOT_PATH}`);
      return;
    }
    console.error(formatIssues(issues));
    process.exit(1);
  }

  await writeWeb3ContractSnapshot(repoRoot, snapshot);
  if (governanceIssues.length > 0) {
    console.warn(formatIssues(governanceIssues));
  }
  console.log(`Wrote ${WEB3_CONTRACT_SNAPSHOT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
