import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import {
  type BeforeAgentStartEvent,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionHandler,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as credentials from "../src/credentials.js";
import { registerAutomaticRouting } from "../src/routing.js";
import * as settings from "../src/settings.js";
import {
  defaultSettings,
  settingsPath,
  writeSettings,
} from "../src/settings.js";
import { gears, model } from "./helpers/models.js";

let directory: string;
const apiKey = "test-key-0123456789abcdef";
const request = vi.fn<typeof fetch>();

const harness = () => {
  const on = vi.fn();
  const pi = {
    on,
    setModel: vi.fn<ExtensionAPI["setModel"]>().mockResolvedValue(true),
    setThinkingLevel: vi.fn<ExtensionAPI["setThinkingLevel"]>(),
    getThinkingLevel: vi
      .fn<ExtensionAPI["getThinkingLevel"]>()
      .mockReturnValue("medium"),
  };
  const sessionManager = SessionManager.inMemory(directory);
  const projection = vi.spyOn(sessionManager, "buildSessionProjection");
  const ctx = {
    model: model({ id: "original-model" }),
    modelRegistry: {
      find: vi.fn<ExtensionContext["modelRegistry"]["find"]>((provider, id) =>
        model({ provider, id }),
      ),
    },
    sessionManager,
    signal: new AbortController().signal,
    ui: {
      notify: vi.fn<ExtensionContext["ui"]["notify"]>(),
      setStatus: vi.fn<ExtensionContext["ui"]["setStatus"]>(),
    },
  };
  registerAutomaticRouting(pi as unknown as ExtensionAPI);
  expect(on.mock.calls[0]?.[0]).toBe("before_agent_start");
  const handler = on.mock
    .calls[0]?.[1] as ExtensionHandler<BeforeAgentStartEvent>;
  const run = (prompt = "Investigate this bug") =>
    Promise.resolve(
      handler(
        {
          type: "before_agent_start",
          prompt,
          systemPrompt: "",
          systemPromptOptions: {},
        } as BeforeAgentStartEvent,
        ctx as unknown as ExtensionContext,
      ),
    );
  return { pi, ctx, projection, run };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "gearshift-routing-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", directory);
  vi.stubEnv("TYPESAFE_API_KEY", apiKey);
  request
    .mockReset()
    .mockImplementation(async () =>
      Response.json({ answers: { gear: { score: 1, confidence: 0.9 } } }),
    );
  vi.stubGlobal("fetch", request);
  writeSettings({ enabled: true, onboardingDone: true, gearBias: 0, gears });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

test.each(["", "  \n"])(
  "empty prompt %j does no routing work",
  async (prompt) => {
    const { run, projection, pi } = harness();
    await run(prompt);
    expect(projection).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
  },
);

test("disabled routing never projects history, requests judgment, or changes the model", async () => {
  writeSettings(defaultSettings());
  const credentialLookup = vi.spyOn(credentials, "credentialState");
  const { run, projection, pi, ctx } = harness();
  projection.mockImplementation(() => {
    throw new Error("should not project");
  });
  await expect(run()).resolves.toBeUndefined();
  expect(projection).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(pi.setModel).not.toHaveBeenCalled();
  expect(pi.setThinkingLevel).not.toHaveBeenCalled();
  expect(ctx.ui.setStatus).not.toHaveBeenCalled();
  expect(credentialLookup).not.toHaveBeenCalled();
});

test.each(["missing", "invalid", "settings"])(
  "unusable %s configuration leaves Pi unchanged",
  async (kind) => {
    if (kind === "missing") vi.stubEnv("TYPESAFE_API_KEY", "");
    if (kind === "invalid") vi.stubEnv("TYPESAFE_API_KEY", "short");
    if (kind === "settings") writeFileSync(settingsPath(), "broken json");
    const { run, pi, ctx } = harness();
    await expect(run()).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "warning");
  },
);

test("history projection failure is contained without exposing the exception", async () => {
  const { run, projection, pi, ctx } = harness();
  projection.mockImplementation(() => {
    throw new Error(apiKey);
  });
  await expect(run()).resolves.toBeUndefined();
  expect(request).not.toHaveBeenCalled();
  expect(pi.setModel).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalled();
  expect(JSON.stringify(ctx.ui.notify.mock.calls)).not.toContain(apiKey);
});

test.each(["settings", "credentials"])(
  "unexpected %s resolution failure cannot interrupt Pi",
  async (stage) => {
    const fail = () => {
      throw new Error(apiKey);
    };
    if (stage === "settings")
      vi.spyOn(settings, "settingsState").mockImplementation(fail);
    else vi.spyOn(credentials, "credentialState").mockImplementation(fail);
    const { run, pi, ctx } = harness();
    await expect(run()).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "warning");
    expect(JSON.stringify(ctx.ui.notify.mock.calls)).not.toContain(apiKey);
  },
);

test.each([
  { score: 0, bias: -1, gear: "light" },
  { score: 0.499, bias: 0, gear: "light" },
  { score: 0.5, bias: 0, gear: "standard" },
  { score: 1.499, bias: 0, gear: "standard" },
  { score: 1.5, bias: 0, gear: "heavy" },
  { score: 2, bias: 1, gear: "heavy" },
  { score: 0.3, bias: 1, gear: "standard" },
  { score: 1.7, bias: -1, gear: "standard" },
  { score: 1.2, bias: 1, gear: "heavy" },
  { score: 0.7, bias: -1, gear: "light" },
] as const)(
  "score $score with bias $bias selects $gear",
  async ({ score, bias, gear }) => {
    writeSettings({
      enabled: true,
      onboardingDone: true,
      gearBias: bias,
      gears,
    });
    request.mockResolvedValue(
      Response.json({ answers: { gear: { score, confidence: 0.8 } } }),
    );
    const { run, pi, ctx } = harness();
    await run();
    expect(request).toHaveBeenCalledOnce();
    expect(pi.setModel).toHaveBeenCalledWith(
      expect.objectContaining({ id: gears[gear].model }),
    );
    expect(pi.setThinkingLevel).toHaveBeenCalledWith(gears[gear].thinkingLevel);
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
      "gearshift-routing",
      undefined,
    );
    if (score === 0 || score === 2) {
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining(`→ ${score.toFixed(2)} with bias`),
        "info",
      );
    }
  },
);

test.each(["malformed", "network", "unauthorized"])(
  "%s judgment failure continues without retry or model changes",
  async (failure) => {
    if (failure === "network") request.mockRejectedValue(new Error(apiKey));
    if (failure === "malformed")
      request.mockResolvedValue(
        Response.json({
          answers: { gear: { score: 3, confidence: 1 } },
          secret: apiKey,
        }),
      );
    if (failure === "unauthorized")
      request.mockResolvedValue(
        Response.json({ error: { message: apiKey } }, { status: 401 }),
      );
    const { run, pi, ctx } = harness();
    await expect(run()).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(pi.setThinkingLevel).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "warning");
    expect(JSON.stringify(ctx.ui.notify.mock.calls)).not.toContain(apiKey);
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
      "gearshift-routing",
      undefined,
    );
  },
);

test.each(["lookup", "setModel", "thinking", "getThinking"])(
  "%s application exception is contained and never claims to preserve the original model",
  async (stage) => {
    const { run, pi, ctx } = harness();
    const fail = () => {
      throw new Error(apiKey);
    };
    if (stage === "lookup") ctx.modelRegistry.find.mockImplementation(fail);
    if (stage === "setModel") pi.setModel.mockImplementation(fail);
    if (stage === "thinking") pi.setThinkingLevel.mockImplementation(fail);
    if (stage === "getThinking") pi.getThinkingLevel.mockImplementation(fail);
    await expect(run()).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
    expect(pi.setModel.mock.calls.length).toBeLessThanOrEqual(1);
    const notices = JSON.stringify(ctx.ui.notify.mock.calls);
    expect(notices).not.toContain(apiKey);
    expect(notices).not.toMatch(/keeping the current model/i);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "warning");
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
      "gearshift-routing",
      undefined,
    );
  },
);

test("thinking failure after a model change leaves the changed model in place and reports incomplete application", async () => {
  const { run, pi, ctx } = harness();
  pi.setModel.mockImplementation(async (selected) => {
    ctx.model = selected;
    return true;
  });
  pi.setThinkingLevel.mockImplementation(() => {
    throw new Error("private failure");
  });
  await run();
  expect(ctx.model.id).toBe(gears.standard.model);
  expect(pi.setModel).toHaveBeenCalledOnce();
  expect(ctx.ui.notify).toHaveBeenCalledWith(
    expect.stringMatching(/not.*fully applied|could not fully apply/i),
    "warning",
  );
});

test("missing model leaves model and thinking level unchanged", async () => {
  const { run, pi, ctx } = harness();
  ctx.modelRegistry.find.mockReturnValue(undefined);
  await run();
  expect(request).toHaveBeenCalledOnce();
  expect(pi.setModel).not.toHaveBeenCalled();
  expect(pi.setThinkingLevel).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("not found"),
    "warning",
  );
});

test("model without Pi authentication does not change the thinking level", async () => {
  const { run, pi, ctx } = harness();
  pi.setModel.mockResolvedValue(false);
  await run();
  expect(pi.setThinkingLevel).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("authentication"),
    "warning",
  );
});

test("already-selected model still receives the configured thinking level and reports the effective level", async () => {
  const { run, pi, ctx } = harness();
  ctx.model = model();
  pi.getThinkingLevel.mockReturnValue("high");
  await run();
  expect(pi.setModel).not.toHaveBeenCalled();
  expect(pi.setThinkingLevel).toHaveBeenCalledWith("medium");
  expect(ctx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("(high)"),
    "info",
  );
});

test.each(["notify", "status-start", "status-clear"])(
  "%s failure never escapes or retries judgment",
  async (stage) => {
    const { run, pi, ctx } = harness();
    if (stage === "notify")
      ctx.ui.notify.mockImplementation(() => {
        throw new Error(apiKey);
      });
    ctx.ui.setStatus.mockImplementation((_key, value) => {
      if (stage === (value ? "status-start" : "status-clear"))
        throw new Error(apiKey);
    });
    await expect(run()).resolves.toBeUndefined();
    expect(request.mock.calls.length).toBeLessThanOrEqual(1);
    expect(pi.setModel.mock.calls.length).toBeLessThanOrEqual(1);
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
      "gearshift-routing",
      undefined,
    );
  },
);

test("notification and cleanup failures cannot defeat recovery from a request failure", async () => {
  request.mockRejectedValue(new Error(apiKey));
  const { run, ctx } = harness();
  ctx.ui.notify.mockImplementation(() => {
    throw new Error("notification failed");
  });
  ctx.ui.setStatus.mockImplementation((_key, value) => {
    if (!value) throw new Error("cleanup failed");
  });
  await expect(run()).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledOnce();
});

test("judgment receives only recent user and assistant text, never thinking, tools, images, or system content", async () => {
  const { run, ctx } = harness();
  const messages: Message[] = [
    { role: "system", content: "private system", timestamp: 0 },
    ...Array.from(
      { length: 11 },
      (_, index): Message => ({
        role: "user",
        content: `message ${index}`,
        timestamp: index,
      }),
    ),
    {
      role: "user",
      content: [
        { type: "text", text: "visible user" },
        {
          type: "image",
          mimeType: "image/png",
          data: "private image",
        },
      ],
      timestamp: 12,
    },
    {
      role: "assistant",
      api: "openai-responses",
      provider: "test-provider",
      model: "standard-model",
      stopReason: "toolUse",
      timestamp: 13,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      content: [
        { type: "thinking", thinking: "private reasoning" },
        { type: "text", text: "visible answer" },
        {
          type: "toolCall",
          id: "call",
          name: "read",
          arguments: { path: "private path" },
        },
        { type: "text", text: "more text" },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "call",
      toolName: "read",
      content: [{ type: "text", text: "private result" }],
      isError: false,
      timestamp: 14,
    },
    { role: "user", content: "  ", timestamp: 15 },
    { role: "user", content: "😀".repeat(2_000), timestamp: 16 },
  ];
  for (const message of messages) ctx.sessionManager.appendMessage(message);
  request.mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.state.currentRequest).toBe("current request");
    expect(body.state.recent).toHaveLength(10);
    expect(body.state.recent[0]).toEqual({ role: "user", text: "message 4" });
    expect(body.state.recent).toContainEqual({
      role: "user",
      text: "visible user",
    });
    expect(body.state.recent).toContainEqual({
      role: "assistant",
      text: "visible answer\nmore text",
    });
    expect(JSON.stringify(body)).not.toContain("private");
    const lastText = body.state.recent.at(-1).text as string;
    expect([...lastText].length).toBeLessThan(2_000);
    expect(lastText.isWellFormed()).toBe(true);
    return Response.json({ answers: { gear: { score: 1, confidence: 0.9 } } });
  });
  await run("current request");
  expect(request).toHaveBeenCalledOnce();
  expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "info");
});
