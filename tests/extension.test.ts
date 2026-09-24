import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DefaultResourceLoader,
  type RegisteredCommand,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { credentialState } from "../src/credentials.js";
import {
  type Gear,
  type GearConfig,
  settingsPath,
  settingsState,
  writeSettings,
} from "../src/settings.js";

let dataDirectory: string;
let command: RegisteredCommand;
let customResult: string | undefined;
let notices: string[];

const context = {
  hasUI: true,
  mode: "tui",
  ui: {
    custom: async () => customResult,
    notify: (message: string) => notices.push(message),
  },
};

const runCommand = (args: string) =>
  Reflect.apply(command.handler, command, [args, context]);

beforeEach(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "pi-gearshift-extension-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", dataDirectory);
  vi.stubEnv("TYPESAFE_API_KEY", undefined);
  customResult = undefined;
  notices = [];

  vi.stubGlobal("fetch", async (input: URL | RequestInfo) => {
    expect(String(input)).toMatch(/\/v1\/models$/);
    return Response.json({
      models: [
        { name: "jev-latest", description: "", release_date: "2026-01-01" },
      ],
    });
  });

  const loader = new DefaultResourceLoader({
    cwd: dataDirectory,
    agentDir: dataDirectory,
    settingsManager: SettingsManager.inMemory(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: [resolve("src/index.ts")],
  });
  await loader.reload();

  const extensions = loader.getExtensions();
  expect(extensions.errors).toEqual([]);
  const registered = extensions.extensions[0]?.commands.get("gearshift");
  expect(registered).toBeDefined();
  command = registered as RegisteredCommand;
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(dataDirectory, { recursive: true, force: true });
});

test("loads through Pi and reports a safe default state", async () => {
  await runCommand("status");

  expect(notices.at(-1)).toMatch(/disabled/);
  expect(notices.at(-1)).toMatch(/not configured/);
});

test("supports the login, enable, and logout lifecycle without exposing the key", async () => {
  const apiKey = "stored-key-0123456789abcdef";
  customResult = apiKey;

  await runCommand("login");
  await runCommand("enable");
  expect(settingsState()).toEqual({
    kind: "loaded",
    settings: { enabled: false, onboardingDone: false, gearBias: 0 },
  });
  expect(notices.at(-1)).toMatch(/Configure light, standard, and heavy/);

  const fullGears = {
    light: {
      provider: "anthropic",
      model: "haiku",
      thinkingLevel: "off",
    },
    standard: {
      provider: "anthropic",
      model: "sonnet",
      thinkingLevel: "low",
    },
    heavy: {
      provider: "anthropic",
      model: "opus",
      thinkingLevel: "high",
    },
  } satisfies Record<Gear, GearConfig>;
  writeSettings({
    enabled: false,
    onboardingDone: false,
    gearBias: 0,
    gears: fullGears,
  });

  await runCommand("enable");
  expect(settingsState()).toEqual({
    kind: "loaded",
    settings: {
      enabled: true,
      onboardingDone: false,
      gearBias: 0,
      gears: fullGears,
    },
  });
  expect(notices.join("\n")).not.toContain(apiKey);

  await runCommand("logout");
  expect(settingsState()).toEqual({
    kind: "loaded",
    settings: {
      enabled: false,
      onboardingDone: false,
      gearBias: 0,
      gears: fullGears,
    },
  });
  expect(credentialState().kind).toBe("missing");
});

test("status identifies missing settings fields without repeating the file path", async () => {
  writeFileSync(
    settingsPath(),
    JSON.stringify({ enabled: false, gearBias: 0 }),
    { mode: 0o600 },
  );
  await runCommand("status");
  const notice = notices.at(-1) ?? "";
  expect(notice).toContain("onboardingDone:");
  expect(notice).toContain("boolean");
  expect(notice.split(settingsPath())).toHaveLength(2);
  expect(notice).toContain("Edit this file");
});

test("unexpected command exceptions never expose upstream details or keys", async () => {
  const secret = "private-key-0123456789abcdef";
  vi.spyOn(context.ui, "custom").mockRejectedValueOnce(new Error(secret));
  await runCommand("login");
  expect(notices.at(-1)).toContain("Unexpected internal error");
  expect(notices.join("\n")).not.toContain(secret);
});

test("headless login retains actionable guidance", async () => {
  await Reflect.apply(command.handler, command, [
    "login",
    { ...context, mode: "print" },
  ]);
  expect(notices.at(-1)).toContain("TYPESAFE_API_KEY");
});

test("preserves corrupted settings file untouched when disabling", async () => {
  const path = settingsPath();
  const corruptedContent = "{ broken json content with user config";
  writeFileSync(path, corruptedContent, { mode: 0o600 });

  await runCommand("disable");

  expect(notices.at(-1)).toMatch(
    /already inactive because settings are unusable/,
  );
  expect(notices.at(-1)).toMatch(/left untouched/);
  expect(readFileSync(path, "utf8")).toBe(corruptedContent);
});
