import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  authenticate,
  RetryableAuthenticationError,
} from "../src/authenticate.js";
import { credentialsPath, storeApiKey } from "../src/credentials.js";
import { registerOnboarding, runOnboarding } from "../src/onboarding/index.js";
import { onboardingTemplates } from "../src/onboarding/templates.js";
import {
  defaultSettings,
  settingsPath,
  settingsState,
  writeSettings,
} from "../src/settings.js";
import { editGear } from "../src/ui/gear-editor.js";

vi.mock("../src/authenticate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/authenticate.js")>()),
  authenticate: vi.fn(),
}));
vi.mock("../src/ui/gear-editor.js", () => ({ editGear: vi.fn() }));

let directory: string;
const confirm = vi.fn();
const select = vi.fn();
const notify = vi.fn();
const context = {
  mode: "tui",
  ui: { confirm, select, notify },
} as unknown as ExtensionContext;

beforeEach(async () => {
  vi.resetAllMocks();
  directory = await mkdtemp(join(tmpdir(), "gearshift-onboarding-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", directory);
  vi.stubEnv("TYPESAFE_API_KEY", "");
  confirm.mockResolvedValue(true);
  select.mockResolvedValue("I am a Claude user");
  vi.mocked(editGear).mockImplementation(
    async (_ctx, gear) => onboardingTemplates.claude.gears[gear],
  );
  vi.mocked(authenticate).mockResolvedValue({ models: 1, path: "auth.json" });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

test("configures all gears in order using a template before authenticating and saving", async () => {
  await runOnboarding(context);
  expect(confirm).toHaveBeenCalledWith(
    "Welcome to Gearshift",
    expect.stringContaining("thinking level"),
  );
  expect(select).toHaveBeenCalledWith("Choose a starting template", [
    "I am a Claude user",
    "I am a Codex user",
    "None of the above",
  ]);
  expect(vi.mocked(editGear).mock.calls.map((call) => call[1])).toEqual([
    "standard",
    "heavy",
    "light",
  ]);
  for (const [ctx, gear, current, description] of vi.mocked(editGear).mock
    .calls) {
    expect(ctx).toBe(context);
    expect(current).toEqual(onboardingTemplates.claude.gears[gear]);
    expect(description).toBeTruthy();
  }
  expect(vi.mocked(authenticate).mock.invocationCallOrder[0]).toBeGreaterThan(
    vi.mocked(editGear).mock.invocationCallOrder[2] ?? 0,
  );
  expect(settingsState()).toEqual({
    kind: "loaded",
    settings: {
      enabled: true,
      onboardingDone: true,
      gearBias: 0,
      gears: onboardingTemplates.claude.gears,
    },
  });
});

test("uses the Codex template", async () => {
  select.mockResolvedValue("I am a Codex user");
  await runOnboarding(context);
  expect(editGear).toHaveBeenNthCalledWith(
    1,
    context,
    "standard",
    onboardingTemplates.codex.gears.standard,
    expect.any(String),
  );
});

test("starts without a template and preserves existing bias", async () => {
  writeSettings({ ...defaultSettings(), gearBias: 0.5 });
  select.mockResolvedValue("None of the above");
  await runOnboarding(context);
  expect(editGear).toHaveBeenNthCalledWith(
    1,
    context,
    "standard",
    undefined,
    expect.any(String),
  );
  expect(settingsState()).toMatchObject({
    settings: { gearBias: 0.5, onboardingDone: true },
  });
});

test("skips key input when an environment key exists", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key-0123456789abcdef");
  await runOnboarding(context);
  expect(authenticate).not.toHaveBeenCalled();
  expect(settingsState()).toMatchObject({ settings: { onboardingDone: true } });
});

test("skips key input when a valid stored credential exists", async () => {
  storeApiKey("stored-key-0123456789abcdef");
  await runOnboarding(context);
  expect(authenticate).not.toHaveBeenCalled();
  expect(settingsState()).toMatchObject({ settings: { onboardingDone: true } });
});

test.each(["invalid JSON", JSON.stringify({ apiKey: "short" })])(
  "prompts when stored credentials are unusable: %s",
  async (content) => {
    writeFileSync(credentialsPath(), content, { mode: 0o600 });
    await runOnboarding(context);
    expect(authenticate).toHaveBeenCalledOnce();
  },
);

test("invalid environment credentials do not fall back to stored credentials", async () => {
  storeApiKey("stored-key-0123456789abcdef");
  vi.stubEnv("TYPESAFE_API_KEY", "short");
  await expect(runOnboarding(context)).rejects.toThrow("TYPESAFE_API_KEY");
  expect(authenticate).not.toHaveBeenCalled();
});

test.each(["welcome", "template", "standard", "heavy", "light", "key"])(
  "cancelling %s leaves settings untouched",
  async (step) => {
    if (step === "welcome") confirm.mockResolvedValue(false);
    if (step === "template") select.mockResolvedValue(undefined);
    if (step === "key") vi.mocked(authenticate).mockResolvedValue(undefined);
    vi.mocked(editGear).mockImplementation(async (_ctx, gear) =>
      gear === step ? undefined : onboardingTemplates.claude.gears[gear],
    );
    await runOnboarding(context);
    expect(existsSync(settingsPath())).toBe(false);
    if (step !== "key") expect(authenticate).not.toHaveBeenCalled();
  },
);

test("completed onboarding and non-TUI modes never open the wizard", async () => {
  for (const mode of ["print", "json", "rpc"] as const) {
    await runOnboarding({ ...context, mode });
  }
  writeSettings({ ...defaultSettings(), onboardingDone: true });
  await runOnboarding(context);
  expect(confirm).not.toHaveBeenCalled();
});

test("invalid environment credentials do not complete setup or prompt for a replacement", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "short");
  await expect(runOnboarding(context)).rejects.toThrow();
  expect(authenticate).not.toHaveBeenCalled();
  expect(existsSync(settingsPath())).toBe(false);
});

test("cancellation preserves existing settings on disk", async () => {
  writeSettings({ ...defaultSettings(), gearBias: -0.4 });
  const before = readFileSync(settingsPath(), "utf8");
  vi.mocked(authenticate).mockResolvedValue(undefined);
  await runOnboarding(context);
  expect(readFileSync(settingsPath(), "utf8")).toBe(before);
});

test("unusable settings are never overwritten", async () => {
  writeFileSync(settingsPath(), "invalid json");
  await expect(runOnboarding(context)).rejects.toThrow();
  expect(confirm).not.toHaveBeenCalled();
  expect(readFileSync(settingsPath(), "utf8")).toBe("invalid json");
});

test.each([
  new RetryableAuthenticationError(
    "That does not look like a TypeSafe API key.",
  ),
  new RetryableAuthenticationError("TypeSafe rejected the API key."),
])(
  "authentication errors allow explicit retry without repeating gears: $message",
  async (error) => {
    select
      .mockResolvedValueOnce("I am a Claude user")
      .mockResolvedValueOnce("Try again");
    vi.mocked(authenticate).mockRejectedValueOnce(error);
    await runOnboarding(context);
    expect(select).toHaveBeenLastCalledWith(
      `TypeSafe authentication: ${error.message}`,
      ["Try again", "Cancel setup"],
    );
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(editGear).toHaveBeenCalledTimes(3);
    expect(settingsState()).toMatchObject({
      settings: { onboardingDone: true },
    });
  },
);

test.each(["Cancel setup", undefined])(
  "authentication errors allow cancellation (%s) without saving or automatic retries",
  async (choice) => {
    select
      .mockResolvedValueOnce("I am a Claude user")
      .mockResolvedValueOnce(choice);
    vi.mocked(authenticate).mockRejectedValueOnce(
      new RetryableAuthenticationError("TypeSafe rejected the API key."),
    );
    await runOnboarding(context);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(existsSync(settingsPath())).toBe(false);
  },
);

test("startup reports the settings field that prevents the wizard from opening", async () => {
  writeFileSync(
    settingsPath(),
    JSON.stringify({ enabled: false, gearBias: 0 }),
  );
  const on = vi.fn();
  registerOnboarding({ on } as unknown as ExtensionAPI);
  await on.mock.calls[0]?.[1]({ reason: "startup" }, context);
  expect(confirm).not.toHaveBeenCalled();
  const message = notify.mock.calls[0]?.[0] as string;
  expect(message).toContain("loading settings");
  expect(message).toContain("onboardingDone:");
  expect(message).toContain("boolean");
  expect(message.split(settingsPath())).toHaveLength(2);
});

test("startup boundary catches authentication errors and ignores reloads", async () => {
  const on = vi.fn();
  registerOnboarding({ on } as unknown as ExtensionAPI);
  const handler = on.mock.calls[0]?.[1];
  expect(on.mock.calls[0]?.[0]).toBe("session_start");
  await handler({ reason: "reload" }, context);
  expect(confirm).not.toHaveBeenCalled();
  vi.mocked(authenticate).mockRejectedValue(new Error("secret error"));
  await expect(
    handler({ reason: "startup" }, context),
  ).resolves.toBeUndefined();
  expect(existsSync(settingsPath())).toBe(false);
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining("Gearshift setup — authentication:"),
    "warning",
  );
  expect(JSON.stringify(notify.mock.calls)).not.toContain("secret error");
});
