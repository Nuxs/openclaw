declare module "arweave" {
  type ArweaveTransaction = {
    id: string;
    addTag: (name: string, value: string) => void;
  };

  type ArweaveTransactions = {
    sign: (tx: ArweaveTransaction, key: Record<string, unknown>) => Promise<void>;
    post: (tx: ArweaveTransaction) => Promise<{ status: number; statusText: string }>;
  };

  type ArweaveClient = {
    createTransaction: (
      input: { data: Uint8Array },
      key: Record<string, unknown>,
    ) => Promise<ArweaveTransaction>;
    transactions: ArweaveTransactions;
  };

  const Arweave: {
    init: (options: { host: string; port: number; protocol: string }) => ArweaveClient;
  };

  export default Arweave;
}

declare module "arweave/node/lib/wallet.js" {
  export type JWKInterface = Record<string, unknown>;
}
