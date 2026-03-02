import { readFileSync } from "node:fs";
import Arweave from "arweave";
import type { JWKInterface } from "arweave/node/lib/wallet.js";
import { fetchWithSsrFGuard } from "openclaw/plugin-sdk";
import type { DecentralizedStorageAdapter, GetResult, PutResult } from "./types.js";

export class ArweaveStorageAdapter implements DecentralizedStorageAdapter {
  readonly providerId = "arweave";
  private readonly gateway: string;
  private readonly keyfile: JWKInterface;
  private readonly arweave: ReturnType<typeof Arweave.init>;

  constructor(opts: { gateway?: string; keyfilePath: string }) {
    this.gateway = opts.gateway ?? "https://arweave.net";
    this.keyfile = JSON.parse(readFileSync(opts.keyfilePath, "utf-8")) as JWKInterface;

    const url = new URL(this.gateway);
    this.arweave = Arweave.init({
      host: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      protocol: url.protocol.replace(":", ""),
    });
  }

  async put(input: { bytes: Uint8Array; contentType: string; name?: string }): Promise<PutResult> {
    const tx = await this.arweave.createTransaction({ data: input.bytes }, this.keyfile);
    tx.addTag("Content-Type", input.contentType);
    if (input.name) {
      tx.addTag("OpenClaw-Name", input.name);
    }

    await this.arweave.transactions.sign(tx, this.keyfile);
    const res = await this.arweave.transactions.post(tx);
    if (res.status >= 400) {
      throw new Error(`Arweave upload failed (${res.status}): ${res.statusText}`);
    }

    return {
      cid: tx.id,
      uri: `${this.gateway}/${tx.id}`,
      size: input.bytes.length,
    };
  }

  async get(input: { cid: string }): Promise<GetResult> {
    const url = `${this.gateway}/${input.cid}`;
    const { response: res, release } = await fetchWithSsrFGuard({
      url,
      auditContext: "web3-storage-arweave-get",
    });
    try {
      if (!res.ok) throw new Error(`Arweave fetch failed (${res.status}) for ${input.cid}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    } finally {
      await release();
    }
  }
}
