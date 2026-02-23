export type AgentWalletIntegrationRequest = {
  orderId: string;
  amount: string;
  offerId?: string;
};

export type AgentWalletIntegrationResult = {
  txHash: string;
  orderId: string;
};

export function buildMarketIntegrationPayload(
  request: AgentWalletIntegrationRequest,
): AgentWalletIntegrationRequest {
  return { ...request };
}
