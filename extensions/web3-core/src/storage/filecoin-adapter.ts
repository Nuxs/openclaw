import { fetchWithSsrFGuard } from "openclaw/plugin-sdk";
import type { DecentralizedStorageAdapter, GetResult, PutResult } from "./types.js";

const DEFAULT_FILECOIN_ENDPOINT = "https://api.web3.storage/upload";
const DEFAULT_GATEWAY = "https://w3s.link";

export class FilecoinStorageAdapter implements DecentralizedStorageAdapter {
  readonly providerId = "filecoin";
  private readonly token: string;
  private readonly gateway: string;
  private readonly endpoint: string;

  constructor(opts: { token: string; gateway?: string; endpoint?: string }) {
    this.token = opts.token;
    this.gateway = opts.gateway ?? DEFAULT_GATEWAY;
    this.endpoint = opts.endpoint ?? DEFAULT_FILECOIN_ENDPOINT;
  }

  async put(input: { bytes: Uint8Array; contentType: string; name?: string }): Promise<PutResult> {
    const body = Buffer.from(input.bytes);
    const { response: res, release } = await fetchWithSsrFGuard({
      url: this.endpoint,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": input.contentType,
          "X-OpenClaw-Name": input.name ?? "archive.bin",
        },
        body,
      },
      auditContext: "web3-storage-filecoin-put",
    });

    try {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Filecoin upload failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as { cid?: string };
      if (!data.cid) throw new Error("Filecoin upload response missing cid");

      return {
        cid: data.cid,
        uri: `${this.gateway}/ipfs/${data.cid}`,
        size: input.bytes.length,
      };
    } finally {
      await release();
    }
  }

  async get(input: { cid: string }): Promise<GetResult> {
    const url = `${this.gateway}/ipfs/${input.cid}`;
    const { response: res, release } = await fetchWithSsrFGuard({
      url,
      auditContext: "web3-storage-filecoin-get",
    });
    try {
      if (!res.ok) throw new Error(`Filecoin fetch failed (${res.status}) for ${input.cid}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    } finally {
      await release();
    }
  }
}
