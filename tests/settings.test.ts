import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  defaultSettings,
  type Gear,
  type GearConfig,
  type Settings,
  settingsPath,
  settingsState,
  writeSettings,
} from "../src/settings.js";

let dataDirectory: string;

beforeEach(() => {
  dataDirectory = mkdtempSync(join(tmpdir(), "pi-gearshift-settings-test-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", dataDirectory);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dataDirectory, { recursive: true, force: true });
});

describe("settings persistence and validation", () => {
  const sampleGear = {
    provider: "anthropic",
    model: "haiku",
    thinkingLevel: "off",
  } satisfies GearConfig;

  const fullGears = {
    light: sampleGear,
    standard: { ...sampleGear, model: "sonnet" },
    heavy: { ...sampleGear, model: "opus" },
  } satisfies Record<Gear, GearConfig>;

  test("defaults to disabled when no settings file exists", () => {
    expect(defaultSettings()).toEqual({ enabled: false, gearBias: 0 });
    expect(settingsState()).toEqual({
      kind: "loaded",
      settings: { enabled: false, gearBias: 0 },
    });
  });

  test("allows partial gears when disabled", () => {
    const partial: Settings = {
      enabled: false,
      gearBias: 0,
      gears: { light: sampleGear },
    };
    const path = writeSettings(partial);
    expect(path).toBe(settingsPath());
    expect(settingsState()).toEqual({ kind: "loaded", settings: partial });
  });

  test("allows omitting gears entirely when disabled", () => {
    writeSettings({ enabled: false, gearBias: 0 });
    expect(settingsState()).toEqual({
      kind: "loaded",
      settings: { enabled: false, gearBias: 0 },
    });
  });

  test("persists and reads settings with full gears when enabled", () => {
    const full: Settings = {
      enabled: true,
      gearBias: 0,
      gears: fullGears,
    };
    writeSettings(full);
    expect(settingsState()).toEqual({ kind: "loaded", settings: full });
  });

  test("returns unusable when enabled settings miss any gear", () => {
    const path = settingsPath();
    writeFileSync(
      path,
      JSON.stringify({ enabled: true, gears: { light: sampleGear } }),
      { mode: 0o600 },
    );
    expect(settingsState()).toEqual({
      kind: "unusable",
      path,
      reason: expect.stringMatching(/Invalid settings file/),
    });
  });

  test("returns unusable when settings file has unknown fields", () => {
    const path = settingsPath();
    writeFileSync(
      path,
      JSON.stringify({ enabled: false, unknownField: true }),
      { mode: 0o600 },
    );
    expect(settingsState()).toEqual({
      kind: "unusable",
      path,
      reason: expect.stringMatching(/Invalid settings file/),
    });
  });

  test("returns unusable when settings file contains invalid JSON", () => {
    const path = settingsPath();
    writeFileSync(path, "{ broken json content", { mode: 0o600 });
    expect(settingsState()).toEqual({
      kind: "unusable",
      path,
      reason: expect.stringMatching(/Could not read/),
    });
  });
});
