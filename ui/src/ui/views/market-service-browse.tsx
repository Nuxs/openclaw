/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unused-vars */
// ui/src/ui/views/market-service-browse.tsx
/**
 * Market 服务浏览视图
 *
 * Buyer 发现和浏览服务的 UI 界面
 */

import { Box, Text } from "ink";
import { useState, useEffect } from "react";
import { useGateway } from "../hooks/use-gateway.js";

interface ServiceBrowseViewProps {
  onSelect?: (serviceId: string) => void;
  filter?: {
    category?: string;
    maxPrice?: string;
  };
}

export function MarketServiceBrowseView({ onSelect, filter }: ServiceBrowseViewProps) {
  const { call } = useGateway();

  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"price" | "rating" | "popularity">("rating");

  const categories = [
    { id: "", label: "All Categories" },
    { id: "search", label: "Search" },
    { id: "data", label: "Data Enrichment" },
    { id: "inference", label: "Model Inference" },
    { id: "automation", label: "Automation" },
    { id: "code-review", label: "Code Review" },
    { id: "security-review", label: "Security Review" },
  ];

  useEffect(() => {
    void loadServices();
  }, [selectedCategory, sortBy]);

  const loadServices = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await call("web3.market.browse", [
        {
          category: selectedCategory || filter?.category,
          maxPrice: filter?.maxPrice,
          sortBy,
          limit: 20,
        },
      ]);

      setServices(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading services...</Text>
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

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Market - Browse Services</Text>
        <Text dimColor>
          {services.length} service{services.length !== 1 ? "s" : ""} found
        </Text>
      </Box>

      {/* Category Filter */}
      <Box marginTop={1} flexDirection="row">
        {categories.slice(0, 4).map((cat) => (
          <Box
            key={cat.id}
            marginRight={1}
            paddingX={1}
            borderStyle="round"
            borderColor={selectedCategory === cat.id ? "cyan" : "gray"}
          >
            <Text
              color={selectedCategory === cat.id ? "cyan" : undefined}
              bold={selectedCategory === cat.id}
            >
              {cat.label}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="row">
        {categories.slice(4).map((cat) => (
          <Box
            key={cat.id}
            marginRight={1}
            paddingX={1}
            borderStyle="round"
            borderColor={selectedCategory === cat.id ? "cyan" : "gray"}
          >
            <Text
              color={selectedCategory === cat.id ? "cyan" : undefined}
              bold={selectedCategory === cat.id}
            >
              {cat.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Sort Options */}
      <Box marginTop={1} flexDirection="row">
        <Text dimColor>Sort by: </Text>
        {(["rating", "price", "popularity"] as const).map((sort) => (
          <Box key={sort} marginLeft={1}>
            <Text color={sortBy === sort ? "cyan" : undefined} bold={sortBy === sort}>
              {sort.charAt(0).toUpperCase() + sort.slice(1)}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Service List */}
      {services.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No services found matching your criteria.</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {services.map((service, index) => (
            <ServiceCard
              key={service.id}
              service={service}
              index={index}
              onSelect={() => onSelect?.(service.id)}
            />
          ))}
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>Press Enter to view details, Space to select category, 1-3 to sort</Text>
      </Box>
    </Box>
  );
}

interface ServiceCardProps {
  service: any;
  index: number;
  onSelect: () => void;
}

function ServiceCard({ service, index, onSelect }: ServiceCardProps) {
function formatPrice(pricing: Record<string, unknown> | undefined): string {
    if (!pricing) {
      return "N/A";
    }
    if (pricing.type === "fixed") {
      return `${pricing.amount} ${pricing.currency}`;
    }
    return `${pricing.unitPrice}/${pricing.unit || "unit"}`;
  };

  return (
    <Box flexDirection="row" borderStyle="round" paddingX={1} marginTop={index > 0 ? 1 : 0}>
      {/* Index */}
      <Box width={3}>
        <Text dimColor>{index + 1}.</Text>
      </Box>

      {/* Main Content */}
      <Box flexGrow={1} flexDirection="column">
        <Box flexDirection="row">
          <Text bold>{service.name || service.id.slice(0, 20)}</Text>
          <Box marginLeft={2}>
            <Text color="yellow">★ {service.rating?.toFixed(1) || "N/A"}</Text>
          </Box>
        </Box>

        <Box>
          <Text dimColor>
            {service.description?.slice(0, 60) || "No description"}
            {service.description?.length > 60 ? "..." : ""}
          </Text>
        </Box>

        <Box flexDirection="row" marginTop={1}>
          <Box borderStyle="round" paddingX={1}>
            <Text dimColor>{service.deliveryMode || "sync"}</Text>
          </Box>
          <Box borderStyle="round" paddingX={1} marginLeft={1}>
            <Text dimColor>{service.proofType || "tlsnotary"}</Text>
          </Box>
        </Box>
      </Box>

      {/* Price */}
      <Box flexDirection="column" alignItems="flex-end">
        <Text bold>{formatPrice(service.pricing)}</Text>
      </Box>
    </Box>
  );
}

export default MarketServiceBrowseView;
