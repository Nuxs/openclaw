/* eslint-disable @typescript-eslint/no-explicit-any */
// ui/src/ui/views/market-order-detail.tsx
/**
 * Market 订单详情视图
 *
 * 显示订单状态、交付进度、结算信息
 */

import { Box, Text } from "ink";
import { useState, useEffect } from "react";
import { useGateway } from "../hooks/use-gateway.js";

interface OrderDetailViewProps {
  orderId: string;
  onAccept?: () => void;
  onReject?: () => void;
  onBack?: () => void;
}

export function MarketOrderDetailView({
  orderId,
  onAccept,
  onReject,
  onBack: _onBack,
}: OrderDetailViewProps) {
  const { call } = useGateway();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"accepting" | "rejecting" | null>(null);

  useEffect(() => {
    void loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await call("web3.market.order.get", [orderId]);
      setOrder(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAccept = async () => {
    setAction("accepting");
    try {
      await call("web3.market.acceptance.sign", [orderId]);
      await loadOrder();
      onAccept?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAction(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleReject = async (reason: string) => {
    setAction("rejecting");
    try {
      await call("web3.market.acceptance.reject", [orderId, { reason }]);
      await loadOrder();
      onReject?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAction(null);
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading order details...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press R to retry</Text>
        </Box>
      </Box>
    );
  }

  if (!order) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Order not found: {orderId}</Text>
      </Box>
    );
  }

  const statusSteps = [
    { id: "created", label: "Created" },
    { id: "locked", label: "Payment Locked" },
    { id: "granted", label: "Consent Granted" },
    { id: "ready", label: "Delivery Ready" },
    { id: "completed", label: "Delivered" },
    { id: "accepted", label: "Accepted" },
  ];

  const currentStepIndex = statusSteps.findIndex(
    (s) => order.status.includes(s.id) || order.status === `order_${s.id}`,
  );

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Order Details</Text>
        <Text dimColor>{orderId.slice(0, 12)}</Text>
      </Box>

      {/* Status Progress */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Status Progress</Text>
        <Box marginTop={1} flexDirection="row">
          {statusSteps.map((step, i) => (
            <Box key={step.id} flexDirection="row" alignItems="center">
              {i > 0 && <Text dimColor> → </Text>}
              <Text color={i <= currentStepIndex ? "green" : "gray"} bold={i === currentStepIndex}>
                {step.label}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Order Details */}
      <Box marginTop={1} borderStyle="round" padding={1} flexDirection="column">
        <Text bold>Order Information</Text>
        <Box marginTop={1}>
          <Box width={15}>
            <Text dimColor>Order ID:</Text>
          </Box>
          <Text>{order.orderId}</Text>
        </Box>
        <Box marginTop={1}>
          <Box width={15}>
            <Text dimColor>Offer ID:</Text>
          </Box>
          <Text>{order.offerId}</Text>
        </Box>
        <Box marginTop={1}>
          <Box width={15}>
            <Text dimColor>Quantity:</Text>
          </Box>
          <Text>{order.quantity || 1}</Text>
        </Box>
        <Box marginTop={1}>
          <Box width={15}>
            <Text dimColor>Status:</Text>
          </Box>
          <Text>{order.status.replace("order_", "").replace("_", " ")}</Text>
        </Box>
      </Box>

      {/* Pricing */}
      <Box marginTop={1} borderStyle="round" padding={1} flexDirection="column">
        <Text bold>Pricing</Text>
        <Box marginTop={1}>
          <Box width={15}>
            <Text dimColor>Unit Price:</Text>
          </Box>
          <Text>
            {order.unitPrice || order.price} {order.currency}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Box width={15}>
            <Text dimColor>Total:</Text>
          </Box>
          <Text bold>
            {order.totalAmount || order.price} {order.currency}
          </Text>
        </Box>
      </Box>

      {/* Timeline */}
      <Box marginTop={1} borderStyle="round" padding={1} flexDirection="column">
        <Text bold>Timeline</Text>
        <Box marginTop={1}>
          <Box width={15}>
            <Text dimColor>Created:</Text>
          </Box>
          <Text>{new Date(order.createdAt).toLocaleString()}</Text>
        </Box>
        {order.paymentTxHash && (
          <Box marginTop={1}>
            <Box width={15}>
              <Text dimColor>Payment:</Text>
            </Box>
            <Text>{order.paymentTxHash.slice(0, 20)}...</Text>
          </Box>
        )}
        {order.deliveryId && (
          <Box marginTop={1}>
            <Box width={15}>
              <Text dimColor>Delivery:</Text>
            </Box>
            <Text>{order.deliveryId}</Text>
          </Box>
        )}
        {order.settlementId && (
          <Box marginTop={1}>
            <Box width={15}>
              <Text dimColor>Settlement:</Text>
            </Box>
            <Text>{order.settlementId}</Text>
          </Box>
        )}
      </Box>

      {/* Actions */}
      {order.status === "delivery_completed" && (
        <Box marginTop={1} flexDirection="row">
          <Box borderStyle="round" paddingX={1} borderColor="green">
            <Text color="green" bold>
              A
            </Text>
            <Text> Accept</Text>
          </Box>
          <Box borderStyle="round" paddingX={1} marginLeft={1} borderColor="red">
            <Text color="red" bold>
              R
            </Text>
            <Text> Reject</Text>
          </Box>
        </Box>
      )}

      {/* Action Status */}
      {action && (
        <Box marginTop={1}>
          <Text dimColor>
            {action === "accepting" ? "Accepting order..." : "Rejecting order..."}
          </Text>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>
          Press R to refresh, Esc to go back
          {order.status === "delivery_completed" && ", A to accept, R to reject"}
        </Text>
      </Box>
    </Box>
  );
}

export default MarketOrderDetailView;
