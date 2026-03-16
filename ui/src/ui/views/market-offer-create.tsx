/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
// ui/src/ui/views/market-offer-create.tsx
/**
 * Market Offer 创建视图
 *
 * Provider 上架服务的 UI 界面
 */

import { Box, Text } from "ink";
import { useState } from "react";
import { useGateway } from "../hooks/use-gateway.js";

interface OfferCreateViewProps {
  onComplete?: (offerId: string) => void;
  onCancel?: () => void;
}

export function MarketOfferCreateView({ onComplete, onCancel }: OfferCreateViewProps) {
  const { call } = useGateway();

  const [step, setStep] = useState<
    "service-type" | "details" | "pricing" | "delivery" | "review" | "creating" | "complete"
  >("service-type");
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    serviceType: "",
    name: "",
    description: "",
    pricingType: "fixed",
    price: "0.01",
    currency: "USDC",
    supply: "unlimited",
    deliveryMode: "sync",
    proofType: "tlsnotary",
  });

  const serviceTypes = [
    { id: "search", label: "Search", desc: "Web search, data retrieval" },
    { id: "data", label: "Data Enrichment", desc: "Data cleaning, annotation" },
    { id: "inference", label: "Model Inference", desc: "LLM, image, audio" },
    { id: "automation", label: "Automation", desc: "Scheduled tasks, batch processing" },
    { id: "code-review", label: "Code Review", desc: "Code audit, security scan" },
    { id: "security-review", label: "Security Review", desc: "Vulnerability assessment" },
  ];

  const pricingTypes = [
    { id: "fixed", label: "Fixed Price", desc: "One-time payment per request" },
    { id: "metered", label: "Metered", desc: "Pay per unit of usage" },
  ];

  const deliveryModes = [
    { id: "sync", label: "Synchronous", desc: "Immediate response" },
    { id: "async", label: "Asynchronous", desc: "Callback when complete" },
    { id: "scheduled", label: "Scheduled", desc: "Run at specific times" },
  ];

  const proofTypes = [
    { id: "tlsnotary", label: "TLSNotary", desc: "Cryptographic proof of TLS session" },
    { id: "signed_receipt", label: "Signed Receipt", desc: "Provider-signed receipt" },
    { id: "api_response", label: "API Response", desc: "Raw API response hash" },
  ];

  const handleCreateOffer = async () => {
    setStep("creating");
    setError(null);

    try {
      const input = {
        assetType: "service",
        assetMeta: {
          title: formData.name,
          description: formData.description,
          tags: [formData.serviceType],
        },
        price: parseFloat(formData.price),
        currency: formData.currency,
        deliveryType: formData.deliveryMode as "download" | "api" | "service",
        supply: formData.supply === "unlimited" ? undefined : parseInt(formData.supply),
        usageScope: {
          purpose: formData.description,
        },
      };

      const result = await call("web3.market.offer.create", [input]);

      setFormData((prev) => ({ ...prev, offerId: result.offerId }));
      setStep("complete");

      if (onComplete) {
        onComplete(result.offerId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("review");
    }
  };

  // Render based on current step
  switch (step) {
    case "service-type":
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>=== Create New Offer ===</Text>
          <Text dimColor>Step 1 of 5: Select Service Type</Text>
          <Box marginTop={1} flexDirection="column">
            {serviceTypes.map((type, i) => (
              <Box key={type.id} marginTop={i > 0 ? 1 : 0}>
                <Text>{i + 1}. </Text>
                <Text bold>{type.label}</Text>
                <Text dimColor> - {type.desc}</Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press 1-{serviceTypes.length} to select, or Esc to cancel</Text>
          </Box>
        </Box>
      );

    case "details":
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>=== Create New Offer ===</Text>
          <Text dimColor>Step 2 of 5: Service Details</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>
              Service Type: {serviceTypes.find((t) => t.id === formData.serviceType)?.label}
            </Text>
            <Box marginTop={1}>
              <Text>Name: {formData.name || "(enter name)"}</Text>
            </Box>
            <Box marginTop={1}>
              <Text>Description: {formData.description || "(enter description)"}</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Type to enter details, Enter to continue, Esc to go back</Text>
          </Box>
        </Box>
      );

    case "pricing":
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>=== Create New Offer ===</Text>
          <Text dimColor>Step 3 of 5: Pricing</Text>
          <Box marginTop={1} flexDirection="column">
            {pricingTypes.map((type, i) => (
              <Box key={type.id} marginTop={i > 0 ? 1 : 0}>
                <Text>{i + 1}. </Text>
                <Text bold={formData.pricingType === type.id}>{type.label}</Text>
                <Text dimColor> - {type.desc}</Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text>
              Price: {formData.price} {formData.currency}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text>Supply: {formData.supply}</Text>
          </Box>
        </Box>
      );

    case "delivery":
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>=== Create New Offer ===</Text>
          <Text dimColor>Step 4 of 5: Delivery & Proof</Text>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Delivery Mode:</Text>
            {deliveryModes.map((mode, i) => (
              <Box key={mode.id} marginLeft={2}>
                <Text>{i + 1}. </Text>
                <Text bold={formData.deliveryMode === mode.id}>{mode.label}</Text>
                <Text dimColor> - {mode.desc}</Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Proof Type:</Text>
            {proofTypes.map((proof, i) => (
              <Box key={proof.id} marginLeft={2}>
                <Text>{i + 1}. </Text>
                <Text bold={formData.proofType === proof.id}>{proof.label}</Text>
                <Text dimColor> - {proof.desc}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      );

    case "review":
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>=== Review Your Offer ===</Text>
          <Text dimColor>Step 5 of 5: Review before creating</Text>
          <Box marginTop={1} flexDirection="column">
            <Box borderStyle="round" padding={1} flexDirection="column">
              <Text bold>Service</Text>
              <Text> Type: {serviceTypes.find((t) => t.id === formData.serviceType)?.label}</Text>
              <Text> Name: {formData.name}</Text>
              <Text> Description: {formData.description}</Text>
              <Text />
              <Text bold>Pricing</Text>
              <Text>
                {" "}
                Price: {formData.price} {formData.currency}
              </Text>
              <Text> Supply: {formData.supply}</Text>
              <Text />
              <Text bold>Delivery</Text>
              <Text> Mode: {deliveryModes.find((m) => m.id === formData.deliveryMode)?.label}</Text>
              <Text> Proof: {proofTypes.find((p) => p.id === formData.proofType)?.label}</Text>
            </Box>
          </Box>
          {error && (
            <Box marginTop={1}>
              <Text color="red">Error: {error}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>Press Enter to create offer, or Esc to go back</Text>
          </Box>
        </Box>
      );

    case "creating":
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>Creating offer...</Text>
          <Text dimColor>Please wait</Text>
        </Box>
      );

    case "complete":
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="green" bold>
            ✓ Offer Created Successfully!
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text>Offer ID: {formData.offerId}</Text>
            <Text>Status: draft</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Next Steps:</Text>
            <Text> 1. Review your offer details</Text>
            <Text> 2. Publish when ready: openclaw market offer publish {formData.offerId}</Text>
          </Box>
        </Box>
      );
  }
}

export default MarketOfferCreateView;
