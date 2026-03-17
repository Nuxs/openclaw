export type MarketAuditEventView = {
  id: string;
  kind: string;
  refId: string;
  actor: string | null;
  timestamp: string;
  detailSummary: string | null;
};

export type MarketAuditSnapshot = {
  count: number;
  byKind: Record<string, number>;
  lastEventAt: string | null;
  events: MarketAuditEventView[];
};
