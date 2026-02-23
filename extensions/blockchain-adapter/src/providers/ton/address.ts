import { Address } from "@ton/core";

export function normalizeTonAddress(address: string): string {
  return Address.parse(address).toString();
}
