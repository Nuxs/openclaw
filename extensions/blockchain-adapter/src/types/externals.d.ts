/**
 * Ambient type declarations for external TON libraries.
 *
 * Some TON ecosystem packages ship `*.d.ts` files but miss `types/exports` hints
 * in `package.json` (or are loaded through ESM/CJS wrappers) which can break
 * TypeScript resolution under our build settings.
 *
 * Keep these declarations **minimal** and aligned with what this repo actually uses.
 */

declare module "@ton/core" {
  export class Address {
    static parse(source: string): Address;
    static isFriendly(source: string): boolean;
    toString(params?: { urlSafe?: boolean; bounceable?: boolean; testOnly?: boolean }): string;
    toRawString(): string;
    readonly hash: Buffer;
    readonly workChain: number;
    equals(other: Address): boolean;
  }

  export class Cell {
    static fromBoc(src: Buffer): Cell[];
    toBoc(): Buffer;
    hash(): Buffer;
    beginParse(): Slice;
  }

  export class Builder {
    storeUint(value: number | bigint, bits: number): Builder;
    storeInt(value: number | bigint, bits: number): Builder;
    storeCoins(value: number | bigint): Builder;
    storeAddress(address: Address | null): Builder;
    storeBuffer(buffer: Buffer): Builder;
    storeRef(cell: Cell): Builder;
    storeSlice(slice: Slice): Builder;
    endCell(): Cell;
  }

  export class Slice {
    loadUint(bits: number): number;
    loadUintBig(bits: number): bigint;
    loadInt(bits: number): number;
    loadIntBig(bits: number): bigint;
    loadCoins(): bigint;
    loadAddress(): Address;
    loadMaybeAddress(): Address | null;
    loadBuffer(bytes: number): Buffer;
    loadBits(bits: number): { length: number };
    readonly remainingBits: number;
    readonly remainingRefs: number;
  }

  export function beginCell(): Builder;

  export function internal(args: {
    to: Address | string;
    value: bigint | string;
    init?: { code: Cell; data: Cell };
    body?: Cell | string;
    bounce?: boolean;
  }): unknown;

  export interface ContractProvider {
    getState(): Promise<unknown>;
    get(name: string, args: unknown[]): Promise<unknown>;
    external(message: Cell): Promise<void>;
    internal(
      via: unknown,
      args: { value: bigint | string; bounce?: boolean; body?: Cell | string },
    ): Promise<void>;
  }

  export enum SendMode {
    CARRY_ALL_REMAINING_BALANCE = 128,
    CARRY_ALL_REMAINING_INCOMING_VALUE = 64,
    DESTROY_ACCOUNT_IF_ZERO = 32,
    PAY_GAS_SEPARATELY = 1,
    IGNORE_ERRORS = 2,
    NONE = 0,
  }

  export function toNano(value: string | number): bigint;
  export function fromNano(value: bigint | string | number): string;
}

declare module "@ton/crypto" {
  export type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

  export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
  export function signVerify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;

  export function mnemonicNew(wordsCount?: number): Promise<string[]>;
  export function mnemonicValidate(mnemonic: string[]): Promise<boolean>;
  export function mnemonicToPrivateKey(mnemonic: string[]): Promise<KeyPair>;
  export function mnemonicToWalletKey(mnemonic: string[]): Promise<KeyPair>;
}

declare module "@ton/ton" {
  import type { Address, Cell, ContractProvider, SendMode } from "@ton/core";

  export class TonClient {
    readonly parameters: { endpoint: string };
    constructor(opts: { endpoint: string; apiKey?: string });

    getBalance(address: Address): Promise<bigint>;

    runMethod(
      address: Address,
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

    getMasterchainInfo(): Promise<{ latestSeqno: number }>;

    provider(address: Address, init?: { code: Cell; data: Cell } | null): ContractProvider;
  }

  export type WalletContractV4Args = {
    workchain: number;
    publicKey: Buffer;
    walletId?: number;
  };

  export class WalletContractV4 {
    static create(args: WalletContractV4Args): WalletContractV4;

    readonly address: Address;
    readonly init: { code: Cell; data: Cell };

    getSeqno(provider: ContractProvider): Promise<number>;

    createTransfer(args: {
      seqno: number;
      secretKey: Buffer;
      messages: unknown[];
      sendMode?: SendMode;
      timeout?: number;
    }): Cell;

    send(provider: ContractProvider, message: Cell): Promise<void>;

    sender(
      provider: ContractProvider,
      secretKey: Buffer,
    ): {
      send: (args: {
        to: Address | string;
        value: bigint | string;
        init?: { code: Cell; data: Cell };
        body?: Cell | string;
        bounce?: boolean;
        sendMode?: SendMode;
      }) => Promise<void>;
    };
  }

  export function internal(args: {
    to: Address | string;
    value: bigint | string;
    init?: { code: Cell; data: Cell };
    body?: Cell | string;
    bounce?: boolean;
  }): unknown;
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
