export interface TEEInterface {
  generateKey(): Promise<{ publicKey: string }>;
  sign(message: string): Promise<{ signature: string }>;
  verifyAttestation(): Promise<{ valid: boolean; quote: string }>;
}
