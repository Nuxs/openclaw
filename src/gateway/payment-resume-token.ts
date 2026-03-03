export type PaymentResumeToken = {
  invoiceId: string;
  paymentReceiptId: string;
  txHash?: string;
  chain: "evm" | "ton";
  issuedAt: string;
  expiresAt: string;
  tokenVersion?: 1 | 2;
  nonce?: string;
  signature?: string;
};

const OPENCLAW_PAYFI_PREFIX = "OpenClaw-PayFi ";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePaymentResumeTokenFromAuthorization(
  authorization?: string,
): PaymentResumeToken | undefined {
  if (!isNonEmptyString(authorization) || !authorization.startsWith(OPENCLAW_PAYFI_PREFIX)) {
    return undefined;
  }
  const encoded = authorization.slice(OPENCLAW_PAYFI_PREFIX.length).trim();
  if (!encoded) {
    return undefined;
  }

  try {
    const raw = Buffer.from(encoded, "base64").toString("utf8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (
      !payload ||
      typeof payload !== "object" ||
      !isNonEmptyString(payload.invoiceId) ||
      !isNonEmptyString(payload.paymentReceiptId) ||
      !isNonEmptyString(payload.issuedAt) ||
      !isNonEmptyString(payload.expiresAt) ||
      (payload.chain !== "evm" && payload.chain !== "ton")
    ) {
      return undefined;
    }

    const txHash = isNonEmptyString(payload.txHash) ? payload.txHash : undefined;
    const tokenVersion =
      payload.tokenVersion === 2 || payload.tokenVersion === 1 ? payload.tokenVersion : undefined;
    const nonce = isNonEmptyString(payload.nonce) ? payload.nonce : undefined;
    const signature = isNonEmptyString(payload.signature) ? payload.signature : undefined;
    return {
      invoiceId: payload.invoiceId,
      paymentReceiptId: payload.paymentReceiptId,
      txHash,
      chain: payload.chain,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      tokenVersion,
      nonce,
      signature,
    };
  } catch {
    return undefined;
  }
}

export function comparePaymentResumeTokenIdentity(
  left: PaymentResumeToken,
  right: PaymentResumeToken,
): boolean {
  return (
    left.invoiceId === right.invoiceId &&
    left.paymentReceiptId === right.paymentReceiptId &&
    left.chain === right.chain
  );
}

export function validatePaymentResumeToken(
  token: PaymentResumeToken,
  nowMs = Date.now(),
): { valid: true } | { valid: false; error: string } {
  const issuedAtMs = Date.parse(token.issuedAt);
  if (Number.isNaN(issuedAtMs)) {
    return { valid: false, error: "autopay resume token issuedAt is invalid" };
  }
  const expiresAtMs = Date.parse(token.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return { valid: false, error: "autopay resume token expiresAt is invalid" };
  }
  if (expiresAtMs <= nowMs) {
    return { valid: false, error: "autopay resume token expired" };
  }
  if (issuedAtMs > expiresAtMs) {
    return { valid: false, error: "autopay resume token timeline is invalid" };
  }
  if (
    token.tokenVersion === 2 &&
    (!isNonEmptyString(token.nonce) || !isNonEmptyString(token.signature))
  ) {
    return { valid: false, error: "autopay resume token signature payload is invalid" };
  }
  return { valid: true };
}
