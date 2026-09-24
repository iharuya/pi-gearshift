import type { Api, Model } from "@earendil-works/pi-ai";
import type { Gear, GearConfig } from "../../src/settings.js";

export const model = (overrides: Partial<Model<Api>> = {}): Model<Api> => ({
  id: "standard-model",
  name: "Standard Model",
  provider: "test-provider",
  api: "openai-responses",
  baseUrl: "https://models.invalid",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_000,
  maxTokens: 4_000,
  ...overrides,
});

export const gears = {
  light: {
    provider: "test-provider",
    model: "light-model",
    thinkingLevel: "off",
  },
  standard: {
    provider: "test-provider",
    model: "standard-model",
    thinkingLevel: "medium",
  },
  heavy: {
    provider: "test-provider",
    model: "heavy-model",
    thinkingLevel: "high",
  },
} satisfies Record<Gear, GearConfig>;
