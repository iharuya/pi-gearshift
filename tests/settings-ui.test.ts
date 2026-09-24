import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { configureSettings } from "../src/commands/settings.js";
import { runOnboarding } from "../src/onboarding/index.js";
import { settingsPath, settingsState, writeSettings } from "../src/settings.js";
import { showGearBiasSlider } from "../src/ui/gear-bias-slider.js";
import { gears, model } from "./helpers/models.js";
import { uiHarness } from "./helpers/ui.js";

let directory: string;

const harness = () => {
  const ui = uiHarness();
  const ctx = {
    mode: "tui",
    ui: ui.ui,
    modelRegistry: { getAvailable: () => [model({ id: "replacement" })] },
  } as unknown as ExtensionCommandContext;
  const run = () =>
    configureSettings("", { ctx, pi: {} as ExtensionAPI, report: vi.fn() });
  return { ...ui, ctx, run };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "gearshift-settings-ui-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", directory);
  writeSettings({ enabled: false, onboardingDone: true, gearBias: 0, gears });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

test.each(["model", "thinking", "bias"])(
  "cancelling %s editing preserves the settings file",
  async (step) => {
    const before = readFileSync(settingsPath(), "utf8");
    const { run, ui, interact } = harness();
    ui.select.mockImplementationOnce(async (_title, items) =>
      items.find((item) =>
        item.startsWith(step === "bias" ? "Gear bias" : "Standard"),
      ),
    );
    interact.mockImplementationOnce((component) => {
      component.handleInput?.(step === "thinking" ? "\r" : "\x1b");
    });
    await run();
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  },
);

test("saving a gear preserves other gears, bias, and disabled routing across setup checks", async () => {
  const { run, ui, interact, ctx } = harness();
  ui.select
    .mockImplementationOnce(async (_title, items) =>
      items.find((item) => item.startsWith("Standard")),
    )
    .mockResolvedValueOnce("high");
  interact.mockImplementationOnce((component) => component.handleInput?.("\r"));
  await run();
  expect(settingsState()).toMatchObject({
    settings: {
      enabled: false,
      onboardingDone: true,
      gearBias: 0,
      gears: {
        ...gears,
        standard: {
          provider: "test-provider",
          model: "replacement",
          thinkingLevel: "high",
        },
      },
    },
  });
  await runOnboarding(ctx);
  expect(ui.confirm).not.toHaveBeenCalled();
});

test("bias changes persist without enabling routing or changing gears", async () => {
  const { run, ui, interact } = harness();
  ui.select.mockImplementationOnce(async (_title, items) =>
    items.find((item) => item.startsWith("Gear bias")),
  );
  interact.mockImplementationOnce((component) => {
    component.handleInput?.("\x1b[C");
    component.handleInput?.("\r");
  });
  await run();
  expect(settingsState()).toMatchObject({
    settings: { enabled: false, gearBias: 0.05, gears },
  });
});

test.each([
  { initial: 0, key: "\x1b[C", count: 1, expected: 0.05 },
  { initial: 0, key: "\x1b[D", count: 1, expected: -0.05 },
  { initial: 0, key: "\x1b[C", count: 50, expected: 1 },
  { initial: 0, key: "\x1b[D", count: 50, expected: -1 },
])(
  "bias slider moves by bounded steps to $expected",
  async ({ initial, key, count, expected }) => {
    const { ctx, interact } = harness();
    interact.mockImplementation((component) => {
      for (let index = 0; index < count; index++) component.handleInput?.(key);
      component.handleInput?.("\r");
    });
    await expect(showGearBiasSlider(ctx, initial)).resolves.toBe(expected);
  },
);

test("bias slider fits narrow terminals and cancellation discards adjustments", async () => {
  const { ctx, interact } = harness();
  interact.mockImplementation((component) => {
    component.handleInput?.("\x1b[C");
    for (const width of [0, 1, 10, 40, 80]) {
      for (const line of component.render(width))
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
    component.handleInput?.("\x1b");
  });
  await expect(showGearBiasSlider(ctx, 0.3)).resolves.toBeUndefined();
});
