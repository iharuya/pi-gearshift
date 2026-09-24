import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  isFocusable,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { expect, test } from "vitest";
import { editGear } from "../src/ui/gear-editor.js";
import { showModelSelector } from "../src/ui/model-selector.js";
import { model } from "./helpers/models.js";
import { enterText, uiHarness } from "./helpers/ui.js";

const harness = (models: Model<Api>[] = [model()]) => {
  const ui = uiHarness();
  const ctx = {
    mode: "tui",
    ui: ui.ui,
    modelRegistry: { getAvailable: () => models },
  } as unknown as ExtensionContext;
  return { ...ui, ctx };
};

test("model search matches provider, ID, and display name", async () => {
  const chosen = model({
    provider: "other-provider",
    id: "fast-model",
    name: "Quick Model",
  });
  for (const query of ["other-provider", "fast-model", "Quick"]) {
    const { ctx, interact, requestRender } = harness([model(), chosen]);
    interact.mockImplementation((component) => {
      enterText(component, query);
      component.handleInput?.("\r");
    });
    await expect(
      showModelSelector(ctx, "Select model", undefined),
    ).resolves.toEqual(chosen);
    expect(requestRender).toHaveBeenCalled();
  }
});

test("current model is selected first without changing the catalog order", async () => {
  const current = model({ id: "z-model" });
  const models = [model({ id: "a-model" }), current];
  const before = [...models];
  const { ctx, interact } = harness(models);
  interact.mockImplementation((component) => component.handleInput?.("\r"));
  await expect(
    showModelSelector(ctx, "Select model", {
      provider: current.provider,
      model: current.id,
    }),
  ).resolves.toEqual(current);
  expect(models).toEqual(before);
});

test("arrow navigation selects an available model", async () => {
  const second = model({ id: "z-model" });
  const { ctx, interact } = harness([model({ id: "a-model" }), second]);
  interact.mockImplementation((component) => {
    component.handleInput?.("\x1b[B");
    component.handleInput?.("\r");
  });
  await expect(
    showModelSelector(ctx, "Select model", undefined),
  ).resolves.toEqual(second);
});

test("an unavailable template warns and allows selecting a replacement", async () => {
  const { ctx, interact, ui } = harness();
  interact.mockImplementation((component) => component.handleInput?.("\r"));
  await expect(
    showModelSelector(ctx, "Select model", {
      provider: "missing",
      model: "template",
    }),
  ).resolves.toEqual(model());
  expect(ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("not available"),
    "warning",
  );
});

test("an empty catalog does not open a selector", async () => {
  const { ctx, interact, ui } = harness([]);
  await expect(editGear(ctx, "light", undefined)).resolves.toBeUndefined();
  expect(interact).not.toHaveBeenCalled();
  expect(ui.select).not.toHaveBeenCalled();
  expect(ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("Configure a provider"),
    "warning",
  );
});

test("Enter on an empty search cannot select a hidden model and Esc still cancels", async () => {
  const { ctx, interact, ui } = harness();
  interact.mockImplementation((component) => {
    enterText(component, "unmatched-query");
    component.handleInput?.("\r");
    component.handleInput?.("\x1b");
  });
  await expect(editGear(ctx, "standard", undefined)).resolves.toBeUndefined();
  expect(ui.select).not.toHaveBeenCalled();
});

test("clearing a search restores available models", async () => {
  const { ctx, interact } = harness();
  interact.mockImplementation((component) => {
    enterText(component, "unmatched-query");
    component.handleInput?.("\x15");
    component.handleInput?.("\r");
  });
  await expect(
    showModelSelector(ctx, "Select model", undefined),
  ).resolves.toEqual(model());
});

test.each([0, 1, 10, 40, 80])(
  "selector lines fit width %i with and without matches",
  async (width) => {
    const { ctx, interact } = harness([model({ name: "モデル 😀" })]);
    interact.mockImplementation((component) => {
      for (const query of ["", "unmatched-query"]) {
        if (query) enterText(component, query);
        const lines = component.render(width);
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines)
          expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        component.invalidate();
      }
      component.handleInput?.("\x1b");
    });
    await showModelSelector(
      ctx,
      "Configure Standard",
      undefined,
      "Description",
    );
  },
);

test("search input propagates focus for IME cursor positioning", async () => {
  const { ctx, interact } = harness();
  interact.mockImplementation((component) => {
    expect(isFocusable(component)).toBe(true);
    if (!isFocusable(component))
      throw new Error("Expected a focusable selector");
    expect(component.render(80).join("\n")).toContain(CURSOR_MARKER);
    component.focused = false;
    expect(component.render(80).join("\n")).not.toContain(CURSOR_MARKER);
    component.handleInput?.("\x1b");
  });
  await showModelSelector(ctx, "Select model", undefined);
});

test("thinking choices preserve supported current levels and omit unsupported levels", async () => {
  const supportedModel = model({
    thinkingLevelMap: { minimal: null, xhigh: null, max: "max" },
  });
  const { ctx, interact, ui } = harness([supportedModel]);
  interact.mockImplementation((component) => component.handleInput?.("\r"));
  ui.select.mockImplementation(async (_title, options) => {
    expect(options).toEqual(["max", "off", "low", "medium", "high"]);
    return "high";
  });
  await expect(
    editGear(ctx, "heavy", {
      provider: supportedModel.provider,
      model: supportedModel.id,
      thinkingLevel: "max",
    }),
  ).resolves.toEqual({
    provider: supportedModel.provider,
    model: supportedModel.id,
    thinkingLevel: "high",
  });
});

test("unsupported current thinking level falls back to medium", async () => {
  const { ctx, interact, ui } = harness();
  interact.mockImplementation((component) => component.handleInput?.("\r"));
  ui.select.mockImplementation(async (_title, options) => {
    expect(options[0]).toBe("medium");
    return options[0];
  });
  await expect(
    editGear(ctx, "heavy", {
      provider: "test-provider",
      model: "standard-model",
      thinkingLevel: "max",
    }),
  ).resolves.toMatchObject({ thinkingLevel: "medium" });
});

test("a single supported reasoning level is selected without inventing off", async () => {
  const onlyHigh = model({
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: null,
    },
  });
  const { ctx, interact, ui } = harness([onlyHigh]);
  interact.mockImplementation((component) => component.handleInput?.("\r"));
  await expect(editGear(ctx, "heavy", undefined)).resolves.toMatchObject({
    thinkingLevel: "high",
  });
  expect(ui.select).not.toHaveBeenCalled();
});

test("non-reasoning models use off without prompting", async () => {
  const { ctx, interact, ui } = harness([model({ reasoning: false })]);
  interact.mockImplementation((component) => component.handleInput?.("\r"));
  await expect(editGear(ctx, "light", undefined)).resolves.toMatchObject({
    thinkingLevel: "off",
  });
  expect(ui.select).not.toHaveBeenCalled();
});

test("cancelling thinking selection discards the model selection", async () => {
  const { ctx, interact, ui } = harness();
  interact.mockImplementation((component) => component.handleInput?.("\r"));
  ui.select.mockResolvedValue(undefined);
  await expect(editGear(ctx, "standard", undefined)).resolves.toBeUndefined();
});
