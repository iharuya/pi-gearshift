import type { Gear, GearConfig } from "../settings.js";

export type OnboardingTemplate = {
  label: string;
  gears: Record<Gear, GearConfig>;
};

export const onboardingTemplates = {
  claude: {
    label: "Claude",
    gears: {
      light: {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        thinkingLevel: "low",
      },
      standard: {
        provider: "anthropic",
        model: "claude-opus-5",
        thinkingLevel: "medium",
      },
      heavy: {
        provider: "anthropic",
        model: "claude-fable-5",
        thinkingLevel: "high",
      },
    },
  },
  codex: {
    label: "Codex",
    gears: {
      light: {
        provider: "openai-codex",
        model: "gpt-5.6-luna",
        thinkingLevel: "low",
      },
      standard: {
        provider: "openai-codex",
        model: "gpt-5.6-sol",
        thinkingLevel: "medium",
      },
      heavy: {
        provider: "openai-codex",
        model: "gpt-6-astra",
        thinkingLevel: "high",
      },
    },
  },
} satisfies Record<string, OnboardingTemplate>;

export type OnboardingTemplateId = keyof typeof onboardingTemplates;
