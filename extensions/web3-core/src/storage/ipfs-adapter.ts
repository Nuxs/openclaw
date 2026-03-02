/**
 * IPFS storage adapter via Pinata pinning API.
 * Falls back to public gateway for reads.
 */

import { fetchWithSsrFGuard } from "openclaw/plugin-sdk";
import type { DecentralizedStorageAdapter, PutResult, GetResult } from "./types.js";

export class IpfsStorageAdapter implements DecentralizedStorageAdapter {
  readonly providerId = "ipfs";
  private readonly pinataJwt: string | undefined;
  private readonly gateway: string;

  constructor(opts: { pinataJwt?: string; gateway?: string }) {
    this.pinataJwt = opts.pinataJwt;
    this.gateway = opts.gateway ?? "https://w3s.link";
  }

  async put(input: { bytes: Uint8Array; contentType: string; name?: string }): Promise<PutResult> {
    if (!this.pinataJwt) {
      throw new Error("storage.pinataJwt is required to upload to IPFS via Pinata");
    }

    const buffer =
      input.bytes.buffer instanceof ArrayBuffer
        ? input.bytes.buffer
        : Uint8Array.from(input.bytes).buffer;
    const blob = new Blob([buffer as ArrayBuffer], { type: input.contentType });
    const formData = new FormData();
    formData.append("file", blob, input.name ?? "archive.bin");

    const { response: res, release } = await fetchWithSsrFGuard({
      url: "https://api.pinata.cloud/pinning/pinFileToIPFS",
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${this.pinataJwt}` },
        body: formData,
      },
      auditContext: "web3-storage-ipfs-put",
    });

    try {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Pinata upload failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as { IpfsHash: string; PinSize: number };
      return {
        cid: data.IpfsHash,
        uri: `${this.gateway}/ipfs/${data.IpfsHash}`,
        size: data.PinSize,
      };
    } finally {
      await release();
    }
  }

  async get(input: { cid: string }): Promise<GetResult> {
    const url = `${this.gateway}/ipfs/${input.cid}`;
    const { response: res, release } = await fetchWithSsrFGuard({
      url,
      auditContext: "web3-storage-ipfs-get",
    });
    try {
      if (!res.ok) throw new Error(`IPFS fetch failed (${res.status}) for ${input.cid}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    } finally {
      await release();
    }
  }

  async isPinned(input: { cid: string }): Promise<boolean> {
    if (!this.pinataJwt) return false;
    const { response: res, release } = await fetchWithSsrFGuard({
      url: `https://api.pinata.cloud/data/pinList?hashContains=${input.cid}&status=pinned`,
      init: {
        headers: { Authorization: `Bearer ${this.pinataJwt}` },
      },
      auditContext: "web3-storage-ipfs-is-pinned",
    });
    try {
      if (!res.ok) return false;
      const data = (await res.json()) as { count: number };
      return data.count > 0;
    } finally {
      await release();
    }
  }
}
