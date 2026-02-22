/**
 * Ambient type declarations for external TON libraries.
 *
 * Upstream packages currently do not ship `types`/`typings` entries in `package.json`,
 * so TypeScript cannot resolve their declarations during `tsc`/`tsgo`.
 *
 * These are intentionally minimal and only cover what this repo uses.
 */

declare module "@ton/ton" {
  export class Address {
    static parse(src: string): Address;
  }

  export class Cell {
    static fromBase64(src: string): Cell;
    beginParse(): unknown;
    toBoc(): Buffer;
  }

  export type CellBuilder = {
    storeUint: (value: number, bits: number) => CellBuilder;
    storeStringTail: (value: string) => CellBuilder;
    storeAddress: (value: unknown) => CellBuilder;
    storeCoins: (value: bigint) => CellBuilder;
    storeBit: (value: 0 | 1 | boolean) => CellBuilder;
    endCell: () => Cell;
  };

  export function beginCell(): CellBuilder;

  export const internal: unknown;
  export const WalletContractV4: unknown;

  export class TonClient {
    readonly parameters: { endpoint: string };
    constructor(opts: { endpoint: string; apiKey?: string });
    getBalance(address: unknown): Promise<bigint>;
    runMethod(
      address: unknown,
      method: string,
      params: unknown[],
    ): Promise<{
      stack: {
        readAddress: () => { toString: () => string };
        readAddressOpt: () => { toString: () => string } | null;
        readBigNumber: () => bigint;
        readNumber: () => number;
      };
    }>;
    getMasterchainInfo(): Promise<{ last: { seqno: number } }>;
  }

  export function toNano(value: string | number | bigint): bigint;
  export function fromNano(value: bigint): string;
}

declare module "@tonconnect/sdk" {
  export type TonConnectWalletAccount = {
    address: string;
    publicKey?: string;
  };

  export type TonConnectWallet = {
    account: TonConnectWalletAccount;
  };

  export class TonConnect {
    wallet?: TonConnectWallet;
    constructor(opts: { manifestUrl: string });
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendTransaction(req: unknown): Promise<{ boc: string }>;
  }
}
