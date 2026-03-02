import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";

export type TonKeyPair = {
  publicKey: Buffer;
  secretKey: Buffer;
};

export function splitTonMnemonic(mnemonic: string): string[] {
  const words = mnemonic
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length < 12) {
    throw new Error("ton mnemonic must have at least 12 words");
  }

  return words;
}

export async function createTonMnemonic(wordsCount = 24): Promise<string> {
  const words = await mnemonicNew(wordsCount);
  return words.join(" ");
}

export async function deriveTonKeyPairFromMnemonic(mnemonic: string): Promise<TonKeyPair> {
  const words = splitTonMnemonic(mnemonic);
  const keyPair = await mnemonicToPrivateKey(words);
  return {
    publicKey: Buffer.from(keyPair.publicKey),
    secretKey: Buffer.from(keyPair.secretKey),
  };
}

export async function deriveTonWalletAddressFromMnemonic(
  mnemonic: string,
  workchain = 0,
): Promise<{ address: string; publicKeyHex: string }> {
  const keyPair = await deriveTonKeyPairFromMnemonic(mnemonic);
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });

  return {
    address: wallet.address.toString(),
    publicKeyHex: keyPair.publicKey.toString("hex"),
  };
}
