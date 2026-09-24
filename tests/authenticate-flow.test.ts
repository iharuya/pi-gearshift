import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { authenticate } from "../src/authenticate.js";
import {
  credentialState,
  credentialsPath,
  storeApiKey,
} from "../src/credentials.js";
import { UserFacingError } from "../src/errors.js";
import { registerOnboarding, runOnboarding } from "../src/onboarding/index.js";
import {
  defaultSettings,
  settingsPath,
  settingsState,
  writeSettings,
} from "../src/settings.js";
import * as storage from "../src/storage.js";
import { model } from "./helpers/models.js";
import { enterText, uiHarness } from "./helpers/ui.js";

const apiKey = "test-key-0123456789abcdef";
const request = vi.fn<typeof fetch>();
let directory: string;

const harness = () => {
  const { ui, interact } = uiHarness();
  const ctx = {
    mode: "tui",
    modelRegistry: { getAvailable: () => [model({ reasoning: false })] },
    ui,
  } as unknown as ExtensionContext;
  const enterKey = (value = apiKey) => {
    interact.mockImplementationOnce((component) => {
      enterText(component, value);
      expect(component.render(80).join("\n")).not.toContain(apiKey);
      component.handleInput?.("\r");
    });
  };
  const chooseGears = () => {
    ui.select.mockResolvedValueOnce("None of the above");
    for (let index = 0; index < 3; index++) {
      interact.mockImplementationOnce((component) =>
        component.handleInput?.("\r"),
      );
    }
  };
  return { ctx, ui, interact, enterKey, chooseGears };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "gearshift-auth-flow-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", directory);
  vi.stubEnv("TYPESAFE_API_KEY", "");
  request.mockReset().mockImplementation(async () =>
    Response.json({
      models: [
        { name: "jev-latest", description: "", release_date: "2026-01-01" },
      ],
    }),
  );
  vi.stubGlobal("fetch", request);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

test("real key input is hidden, normalized, verified once, and persisted", async () => {
  const { ctx, enterKey } = harness();
  enterKey(`  ${apiKey}  `);
  await expect(authenticate(ctx)).resolves.toEqual({
    models: 1,
    path: credentialsPath(),
  });
  expect(credentialState()).toMatchObject({ kind: "stored", apiKey });
  expect(request).toHaveBeenCalledOnce();
});

test("cancelling real key input leaves existing credentials unchanged without a request", async () => {
  storeApiKey(apiKey);
  const before = readFileSync(credentialsPath(), "utf8");
  const { ctx, interact } = harness();
  interact.mockImplementationOnce((component) => {
    enterText(component, "replacement-key-0123456789abcdef");
    component.handleInput?.("\x1b");
  });
  await expect(authenticate(ctx)).resolves.toBeUndefined();
  expect(request).not.toHaveBeenCalled();
  expect(readFileSync(credentialsPath(), "utf8")).toBe(before);
});

test("invalid input does not verify or persist credentials", async () => {
  const { ctx, enterKey } = harness();
  enterKey("short");
  await expect(authenticate(ctx)).rejects.toThrow("complete key");
  expect(request).not.toHaveBeenCalled();
  expect(existsSync(credentialsPath())).toBe(false);
});

test("onboarding completes with real gear editing, authentication, and persistence", async () => {
  const { ctx, ui, enterKey, chooseGears } = harness();
  chooseGears();
  enterKey();
  await runOnboarding(ctx);
  expect(settingsState()).toMatchObject({
    settings: {
      enabled: true,
      onboardingDone: true,
      gears: { standard: { model: "standard-model", thinkingLevel: "off" } },
    },
  });
  expect(credentialState()).toMatchObject({ kind: "stored", apiKey });
  expect(request).toHaveBeenCalledOnce();
  expect(JSON.stringify(ui.notify.mock.calls)).not.toContain(apiKey);
  ui.confirm.mockClear();
  await runOnboarding(ctx);
  expect(ui.confirm).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledOnce();
});

test("rejected credentials allow an explicit retry without repeating gear editing", async () => {
  request.mockResolvedValueOnce(
    Response.json({ error: { message: `private ${apiKey}` } }, { status: 401 }),
  );
  const { ctx, ui, interact, enterKey, chooseGears } = harness();
  chooseGears();
  enterKey();
  ui.select.mockResolvedValueOnce("Try again");
  enterKey();
  await runOnboarding(ctx);
  expect(interact).toHaveBeenCalledTimes(5);
  expect(request).toHaveBeenCalledTimes(2);
  expect(settingsState()).toMatchObject({ settings: { onboardingDone: true } });
  expect(JSON.stringify(ui.select.mock.calls)).not.toContain(apiKey);
});

test("credential-save failure stops setup instead of prompting for reauthentication", async () => {
  mkdirSync(credentialsPath());
  const { ctx, ui, enterKey, chooseGears } = harness();
  chooseGears();
  enterKey();
  await expect(runOnboarding(ctx)).rejects.toThrow("Could not write");
  expect(request).toHaveBeenCalledOnce();
  expect(ui.select).toHaveBeenCalledOnce();
  expect(existsSync(settingsPath())).toBe(false);
});

test("settings-save failure preserves the previous settings and newly saved key, and explains the outcome", async () => {
  writeSettings({ ...defaultSettings(), gearBias: 0.4 });
  const before = readFileSync(settingsPath(), "utf8");
  const write = storage.writePrivateJson;
  vi.spyOn(storage, "writePrivateJson").mockImplementation((path, value) => {
    if (path === settingsPath())
      throw new UserFacingError(
        "Could not write settings. Check directory permissions.",
      );
    write(path, value);
  });
  const { ctx, enterKey, chooseGears } = harness();
  chooseGears();
  enterKey();
  await expect(runOnboarding(ctx)).rejects.toThrow(/saved.*key.*retained/i);
  expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  expect(credentialState()).toMatchObject({ kind: "stored", apiKey });
  expect(request).toHaveBeenCalledOnce();
});

test("startup still continues if error reporting itself fails", async () => {
  const { ctx, ui } = harness();
  ui.confirm.mockRejectedValue(new Error(apiKey));
  ui.notify.mockImplementation(() => {
    throw new Error("UI unavailable");
  });
  const on = vi.fn();
  registerOnboarding({ on } as unknown as ExtensionAPI);
  await expect(
    on.mock.calls[0]?.[1]({ reason: "startup" }, ctx),
  ).resolves.toBeUndefined();
  expect(request).not.toHaveBeenCalled();
  expect(existsSync(settingsPath())).toBe(false);
});
