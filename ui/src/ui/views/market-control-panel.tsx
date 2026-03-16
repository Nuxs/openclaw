/* eslint-disable @typescript-eslint/no-explicit-any */
// ui/src/ui/views/market-control-panel.tsx
/**
 * Market 控制面板视图
 *
 * Provider 管理、审计查询、健康探针等运维功能
 */

import { Box, Text } from "ink";
import { useState, useEffect } from "react";
import { useGateway } from "../hooks/use-gateway.js";

type Tab = "providers" | "orders" | "audit" | "health" | "settings";

export function MarketControlPanelView() {
  const { call } = useGateway();

  const [activeTab, _setActiveTab] = useState<Tab>("health");
  const [health, setHealth] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      switch (activeTab) {
        case "health":
          const healthResult = await call("web3.market.health.check", []);
          setHealth(healthResult);
          break;

        case "providers":
          const providersResult = await call("web3.market.provider.list", []);
          setProviders(providersResult);
          break;

        case "orders":
          const ordersResult = await call("web3.market.order.list", [{ limit: 50 }]);
          setOrders(ordersResult);
          break;

        case "audit":
          const auditResult = await call("web3.market.audit.query", [{ limit: 100 }]);
          setAuditLogs(auditResult);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "health", label: "Health" },
    { id: "providers", label: "Providers" },
    { id: "orders", label: "Orders" },
    { id: "audit", label: "Audit" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Market Control Panel</Text>
        <Text dimColor>Operator View</Text>
      </Box>

      {/* Tabs */}
      <Box marginTop={1} flexDirection="row">
        {tabs.map((tab) => (
          <Box
            key={tab.id}
            marginRight={1}
            paddingX={1}
            borderStyle="round"
            borderColor={activeTab === tab.id ? "cyan" : "gray"}
          >
            <Text color={activeTab === tab.id ? "cyan" : undefined} bold={activeTab === tab.id}>
              {tab.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Content */}
      <Box marginTop={1} flexDirection="column">
        {loading ? (
          <Text dimColor>Loading...</Text>
        ) : error ? (
          <Text color="red">Error: {error}</Text>
        ) : (
          renderContent()
        )}
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>Press 1-5 to switch tabs, R to refresh, Q to quit</Text>
      </Box>
    </Box>
  );

  function renderContent() {
    switch (activeTab) {
      case "health":
        return <HealthTab health={health} />;
      case "providers":
        return <ProvidersTab providers={providers} />;
      case "orders":
        return <OrdersTab orders={orders} />;
      case "audit":
        return <AuditTab logs={auditLogs} />;
      case "settings":
        return <SettingsTab />;
      default:
        return null;
    }
  }
}

function HealthTab({ health }: { health: any }) {
  if (!health) {
    return <Text>No health data available</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>System Health</Text>

      <Box marginTop={1}>
        <Text
          color={
            health.overall === "healthy"
              ? "green"
              : health.overall === "degraded"
                ? "yellow"
                : "red"
          }
          bold
        >
          Overall: {health.overall?.toUpperCase()}
        </Text>
      </Box>

      {health.probes?.map((probe: any) => (
        <Box key={probe.component} marginTop={1} borderStyle="round" padding={1}>
          <Box width={15}>
            <Text bold>{probe.component}:</Text>
          </Box>
          <Text
            color={
              probe.status === "healthy" ? "green" : probe.status === "degraded" ? "yellow" : "red"
            }
          >
            {probe.status}
          </Text>
          {probe.details?.error && (
            <Box marginLeft={1}>
              <Text color="red">{probe.details.error}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function ProvidersTab({ providers }: { providers: any[] }) {
  if (providers.length === 0) {
    return <Text>No providers found</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Providers ({providers.length})</Text>

      {providers.map((provider, i) => (
        <Box key={provider.id} marginTop={i > 0 ? 1 : 0} borderStyle="round" padding={1}>
          <Box flexGrow={1} flexDirection="column">
            <Text bold>{provider.name || provider.id.slice(0, 20)}</Text>
            <Text dimColor>Status: {provider.status}</Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end">
            <Text>★ {provider.rating?.toFixed(1) || "N/A"}</Text>
            <Text dimColor>{provider.totalOffers || 0} offers</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function OrdersTab({ orders }: { orders: any[] }) {
  if (orders.length === 0) {
    return <Text>No orders found</Text>;
  }

  const statusCounts = orders.reduce((acc: Record<string, number>, o: any) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <Box flexDirection="column">
      <Text bold>Recent Orders ({orders.length})</Text>

      <Box marginTop={1} flexDirection="row">
        {Object.entries(statusCounts).map(([status, count]) => (
          <Box key={status} marginRight={1} borderStyle="round" paddingX={1}>
            <Text>
              {status.replace("order_", "")}: {count}
            </Text>
          </Box>
        ))}
      </Box>

      {orders.slice(0, 10).map((order, i) => (
        <Box key={order.orderId} marginTop={i > 0 ? 1 : 0}>
          <Text dimColor>{order.orderId.slice(0, 12)}</Text>
          <Text> {order.status.replace("order_", "")} </Text>
          <Text dimColor>
            {order.totalAmount || order.price} {order.currency}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function AuditTab({ logs }: { logs: Record<string, unknown>[] }) {
  if (logs.length === 0) {
    return <Text>No audit logs found</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Audit Log ({logs.length} entries)</Text>

      {logs.slice(0, 20).map((log, i) => (
        <Box key={log.id} marginTop={i > 0 ? 1 : 0} borderStyle="round" padding={1}>
          <Box width={20}>
            <Text dimColor>{new Date(log.timestamp).toLocaleString()}</Text>
          </Box>
          <Box width={15}>
            <Text bold>{log.kind}</Text>
          </Box>
          <Text dimColor>{log.refId?.slice(0, 15)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function SettingsTab() {
  return (
    <Box flexDirection="column">
      <Text bold>Market Settings</Text>

      <Box marginTop={1} borderStyle="round" padding={1}>
        <Text bold>Kill Switch</Text>
        <Box marginTop={1}>
          <Text dimColor>Disable all: </Text>
          <Text color="red">scripts/kill-switch-web3-market.sh disable-all</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Disable autopay: </Text>
          <Text color="yellow">scripts/kill-switch-web3-market.sh disable-autopay</Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" padding={1}>
        <Text bold>Budget Controls</Text>
        <Box marginTop={1}>
          <Text dimColor>Daily limit: </Text>
          <Text>openclaw config get web3.maxDailySpend</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Single tx limit: </Text>
          <Text>openclaw config get web3.maxOrderAmount</Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" padding={1}>
        <Text bold>Rollback</Text>
        <Box marginTop={1}>
          <Text dimColor>Rollback script: </Text>
          <Text>scripts/rollback-web3-market.sh &lt;version&gt;</Text>
        </Box>
      </Box>
    </Box>
  );
}

export default MarketControlPanelView;
