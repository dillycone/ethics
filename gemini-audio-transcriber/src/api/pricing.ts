import { UsageMetadata } from "@google/generative-ai";
import { CostEstimate, ModelChoice } from "../types.js";
import { MODEL_PRICING } from "../config.js";

/**
 * Estimates the cost of an API call based on token usage
 */
export function estimateCost(
  modelChoice: ModelChoice,
  usage?: UsageMetadata
): CostEstimate | undefined {
  if (!usage) {
    return undefined;
  }

  const pricing = MODEL_PRICING[modelChoice];
  if (!pricing) {
    return undefined;
  }

  const { promptTokenCount = 0, candidatesTokenCount = 0 } = usage;

  const inputCost = (promptTokenCount / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (candidatesTokenCount / 1_000_000) * pricing.outputPerMillion;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    assumption: pricing.assumption,
  };
}