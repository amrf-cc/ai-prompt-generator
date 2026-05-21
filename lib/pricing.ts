import mediaModels from "@/config/media-models.json";

export type Pricing =
  | { kind: "per_second"; usd: number }
  | { kind: "per_image"; usd: number }
  | { kind: "per_megapixel"; usd: number }
  | { kind: "per_token"; inputUsdPerMillion: number; outputUsdPerMillion: number }
  | { kind: "unknown" };

export interface CostInputs {
  modelId: string;
  durationSec?: number;
  aspectRatio?: string;
  imageSize?: string;
  imageCount?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface CostComponent {
  label: string;
  quantity: number;
  unitRate: number;
  estimatedUsd: number;
  attributedUsd: number;
}

export interface CostBreakdown {
  totalUsd: number;
  source: "provider" | "computed" | "unknown";
  pricingKind: Pricing["kind"];
  components: CostComponent[];
}

const SIZE_MEGAPIXELS: Record<string, number> = {
  "1K": 1.05,
  "2K": 4.2,
  "4K": 8.3,
};

interface ModelWithPricing {
  id: string;
  pricing?: Pricing;
}

function lookupPricing(modelId: string): Pricing {
  const all = [
    ...(mediaModels.image as ModelWithPricing[]),
    ...(mediaModels.video as ModelWithPricing[]),
  ];
  return all.find((m) => m.id === modelId)?.pricing ?? { kind: "unknown" };
}

function buildComponents(pricing: Pricing, inputs: CostInputs): CostComponent[] {
  switch (pricing.kind) {
    case "per_second": {
      const duration = inputs.durationSec ?? 0;
      return [
        {
          label: "duration_seconds",
          quantity: duration,
          unitRate: pricing.usd,
          estimatedUsd: pricing.usd * duration,
          attributedUsd: pricing.usd * duration,
        },
      ];
    }
    case "per_image": {
      const count = inputs.imageCount ?? 1;
      return [
        {
          label: "images",
          quantity: count,
          unitRate: pricing.usd,
          estimatedUsd: pricing.usd * count,
          attributedUsd: pricing.usd * count,
        },
      ];
    }
    case "per_megapixel": {
      const mp = SIZE_MEGAPIXELS[inputs.imageSize ?? "1K"] ?? 1.05;
      const count = inputs.imageCount ?? 1;
      const quantity = mp * count;
      return [
        {
          label: "megapixels",
          quantity,
          unitRate: pricing.usd,
          estimatedUsd: pricing.usd * quantity,
          attributedUsd: pricing.usd * quantity,
        },
      ];
    }
    case "per_token": {
      const inTokens = inputs.inputTokens ?? 0;
      const outTokens = inputs.outputTokens ?? 0;
      const inUsd = (inTokens / 1_000_000) * pricing.inputUsdPerMillion;
      const outUsd = (outTokens / 1_000_000) * pricing.outputUsdPerMillion;
      return [
        {
          label: "input_tokens",
          quantity: inTokens,
          unitRate: pricing.inputUsdPerMillion,
          estimatedUsd: inUsd,
          attributedUsd: inUsd,
        },
        {
          label: "output_tokens",
          quantity: outTokens,
          unitRate: pricing.outputUsdPerMillion,
          estimatedUsd: outUsd,
          attributedUsd: outUsd,
        },
      ];
    }
    case "unknown":
      return [];
  }
}

/**
 * Compute cost from request inputs. If `providerTotalUsd` is supplied (e.g. from
 * OpenRouter's `usage.cost`), trust it as the total and scale the per-component
 * estimates so they sum to the provider's number. This preserves the breakdown
 * (input vs output tokens, etc.) while keeping the bottom line accurate.
 */
export function computeCost(
  inputs: CostInputs,
  providerTotalUsd?: number | null
): CostBreakdown {
  const pricing = lookupPricing(inputs.modelId);
  const components = buildComponents(pricing, inputs);
  const estimatedTotal = components.reduce((acc, c) => acc + c.estimatedUsd, 0);

  if (typeof providerTotalUsd === "number" && providerTotalUsd >= 0) {
    if (estimatedTotal > 0) {
      const scale = providerTotalUsd / estimatedTotal;
      return {
        totalUsd: providerTotalUsd,
        source: "provider",
        pricingKind: pricing.kind,
        components: components.map((c) => ({
          ...c,
          attributedUsd: c.estimatedUsd * scale,
        })),
      };
    }
    return {
      totalUsd: providerTotalUsd,
      source: "provider",
      pricingKind: pricing.kind,
      components: [
        {
          label: "provider_total",
          quantity: 1,
          unitRate: providerTotalUsd,
          estimatedUsd: providerTotalUsd,
          attributedUsd: providerTotalUsd,
        },
      ],
    };
  }

  if (pricing.kind === "unknown" || estimatedTotal === 0) {
    return {
      totalUsd: 0,
      source: "unknown",
      pricingKind: pricing.kind,
      components,
    };
  }

  return {
    totalUsd: estimatedTotal,
    source: "computed",
    pricingKind: pricing.kind,
    components,
  };
}
