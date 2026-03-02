#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Address, beginCell, Cell, contractAddress, internal, toNano } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV4 } from "@ton/ton";

function readArg(name) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function splitMnemonic(mnemonic) {
  return mnemonic
    .trim()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

async function findNewestArtifact(dir) {
  const entries = await fs.readdir(dir);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.endsWith(".boc") && !entry.endsWith(".cell")) continue;
    const fullPath = path.join(dir, entry);
    const stat = await fs.stat(fullPath);
    candidates.push({ fullPath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.fullPath;
}

async function compileSettlementContract(contractPath) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ton-contract-"));
  const fcTarget = path.join(tmp, "settlement.fc");
  const fifTarget = path.join(tmp, "settlement.fif");
  await fs.copyFile(contractPath, fcTarget);

  try {
    execFileSync("func", ["-o", fifTarget, "-SPA", fcTarget], { stdio: "inherit" });
  } catch (err) {
    throw new Error("Missing TON compiler toolchain. Install `func` and retry (expected on PATH).");
  }

  try {
    execFileSync("fift", ["-s", fifTarget], { stdio: "inherit" });
  } catch (err) {
    throw new Error("Missing TON Fift toolchain. Install `fift` and retry (expected on PATH).");
  }

  const artifact = await findNewestArtifact(tmp);
  if (!artifact) {
    throw new Error(
      `Compilation succeeded but no .boc/.cell artifact was found in ${tmp}. ` +
        "Please adjust your local TON toolchain to emit a code BOC.",
    );
  }

  const codeBoc = await fs.readFile(artifact);
  const codeCell = Cell.fromBoc(codeBoc)[0];
  if (!codeCell) {
    throw new Error("Failed to parse compiled contract code as a Cell");
  }

  return { code: codeCell };
}

async function main() {
  const network = (readArg("network") ?? process.env.TON_NETWORK ?? "testnet").toLowerCase();
  const rpcUrl =
    readArg("rpcUrl") ??
    process.env.TON_RPC_URL ??
    (network === "mainnet"
      ? "https://toncenter.com/api/v2/jsonRPC"
      : "https://testnet.toncenter.com/api/v2/jsonRPC");

  const apiKey = readArg("apiKey") ?? process.env.TON_API_KEY;
  const mnemonic = readArg("mnemonic") ?? process.env.TON_MNEMONIC;
  const ownerAddressRaw = readArg("owner") ?? process.env.TON_OWNER_ADDRESS;

  const workchain = Number(readArg("workchain") ?? process.env.TON_WORKCHAIN ?? "0");

  const contractPath = path.join(process.cwd(), "contracts", "ton", "settlement.fc");

  const ownerAddress = ownerAddressRaw
    ? Address.parse(requireString(ownerAddressRaw, "owner"))
    : null;

  const walletMnemonic = splitMnemonic(requireString(mnemonic, "mnemonic"));
  const keyPair = await mnemonicToPrivateKey(walletMnemonic);

  const client = new TonClient({ endpoint: rpcUrl, apiKey });
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
  const walletProvider = client.provider(wallet.address, wallet.init);

  const { code } = await compileSettlementContract(contractPath);

  const ownerPubkey = BigInt(`0x${Buffer.from(keyPair.publicKey).toString("hex")}`);

  const data = beginCell()
    .storeAddress(ownerAddress)
    .storeUint(ownerPubkey, 256)
    .storeCoins(0n)
    .storeUint(0, 32)
    .storeDict()
    .endCell();

  const init = { code, data };
  const address = contractAddress(workchain, init);

  // Deploy by sending an internal message with StateInit.
  // Provide a small value for storage + fees.
  const deployValue = toNano("0.1");
  const deployMsg = internal({
    to: address,
    value: deployValue,
    init,
    body: beginCell().storeStringTail("OpenClaw settlement deploy").endCell(),
    bounce: false,
  });

  const seqno = await wallet.getSeqno(walletProvider);
  const transfer = wallet.createTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [deployMsg],
  });

  await wallet.send(walletProvider, transfer);

  // IMPORTANT: don't print secrets; only addresses.
  console.log(
    JSON.stringify(
      {
        network,
        rpcUrl,
        walletAddress: wallet.address.toString(),
        contractAddress: address.toString(),
        deployBocBase64: transfer.toBoc().toString("base64"),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
