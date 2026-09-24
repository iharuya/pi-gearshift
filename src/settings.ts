import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as z from "zod";
import { dataDirectory, readJson, writePrivateJson } from "./storage.js";

export const GEARS = ["light", "standard", "heavy"] as const;
export const GEAR_BIAS_MIN = -1;
export const GEAR_BIAS_MAX = 1;

export const formatGearBias = (value: number): string =>
  value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);

export type ThinkingLevel = Parameters<ExtensionAPI["setThinkingLevel"]>[0];
const defineThinkingLevels = <const Levels extends readonly ThinkingLevel[]>(
  levels: Levels & ([ThinkingLevel] extends [Levels[number]] ? unknown : never),
): Levels => levels;
export const THINKING_LEVELS = defineThinkingLevels([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const gearConfigSchema = z.strictObject({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  thinkingLevel: z.enum(THINKING_LEVELS),
});

const partialGearsSchema = z.strictObject({
  light: gearConfigSchema.optional(),
  standard: gearConfigSchema.optional(),
  heavy: gearConfigSchema.optional(),
});

const fullGearsSchema = z.strictObject({
  light: gearConfigSchema,
  standard: gearConfigSchema,
  heavy: gearConfigSchema,
});

const gearBiasSchema = z
  .number()
  .min(GEAR_BIAS_MIN)
  .max(GEAR_BIAS_MAX)
  .default(0);

const settingsSchema = z.discriminatedUnion("enabled", [
  z.strictObject({
    enabled: z.literal(false),
    onboardingDone: z.boolean(),
    gearBias: gearBiasSchema,
    gears: partialGearsSchema.optional(),
  }),
  z.strictObject({
    enabled: z.literal(true),
    onboardingDone: z.boolean(),
    gearBias: gearBiasSchema,
    gears: fullGearsSchema,
  }),
]);

export type Gear = (typeof GEARS)[number];
export type GearConfig = z.infer<typeof gearConfigSchema>;
export type Settings = z.infer<typeof settingsSchema>;

export const isGear = (value: string): value is Gear =>
  GEARS.some((gear) => gear === value);

export const hasAllGears = (
  gears: Settings["gears"],
): gears is Record<Gear, GearConfig> =>
  Boolean(gears && GEARS.every((gear) => Boolean(gears[gear])));

export const defaultSettings = (): Settings => ({
  enabled: false,
  onboardingDone: false,
  gearBias: 0,
});

export const settingsPath = (): string =>
  join(dataDirectory(), "settings.json");

const parseSettings = (value: unknown, path: string): Settings => {
  const result = settingsSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "settings"}: ${issue.message}`,
    );
    throw new Error(`Invalid settings file at ${path}:\n${issues.join("\n")}`);
  }

  return result.data;
};

export type SettingsState =
  | { kind: "loaded"; settings: Settings }
  | { kind: "unusable"; path: string; reason: string };

export const settingsState = (): SettingsState => {
  const path = settingsPath();
  try {
    const stored = readJson(path);
    const settings =
      stored === undefined ? defaultSettings() : parseSettings(stored, path);
    return { kind: "loaded", settings };
  } catch (error) {
    return {
      kind: "unusable",
      path,
      reason:
        error instanceof Error ? error.message : `Could not read ${path}.`,
    };
  }
};

export const describeSettingsError = (
  state: Extract<SettingsState, { kind: "unusable" }>,
): string =>
  `${state.reason}\nEdit this file to fix the issue, or remove it to start setup again.`;

export const writeSettings = (settings: Settings): string => {
  const path = settingsPath();
  writePrivateJson(path, settingsSchema.parse(settings));
  return path;
};
