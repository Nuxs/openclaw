/**
 * Decentralized storage adapter interface.
 * Implementations: IPFS (Pinata), Arweave, Filecoin.
 */

export type PutResult = {
  /** Content identifier (CID for IPFS, tx id for Arweave) */
  cid: string;
  /** Full retrieval URI */
  uri: string;
  /** Size in bytes of the uploaded payload */
  size: number;
};

export type GetResult = {
  bytes: Uint8Array;
  contentType: string;
};

export interface DecentralizedStorageAdapter {
  readonly providerId: string;

  /**
   * Upload content. If encryption is enabled (default), the caller
   * is responsible for encrypting `bytes` before calling this.
   */
  put(input: { bytes: Uint8Array; contentType: string; name?: string }): Promise<PutResult>;

  /** Retrieve content by CID / identifier. */
  get(input: { cid: string }): Promise<GetResult>;

  /** Check if content is still pinned / available. */
  isPinned?(input: { cid: string }): Promise<boolean>;
}
