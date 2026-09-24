import type { Fetch } from "@typesafe-ai/sdk";
import { expect, test, vi } from "vitest";
import { judgeGear } from "../src/typesafe.js";

const apiKey = "test-key-0123456789abcdef";

test("production judgment validates the response and sends the request and recent context", async () => {
  const request = vi.fn<Fetch>(async () =>
    Response.json({ answers: { gear: { score: 1.4, confidence: 0.8 } } }),
  );
  const recent = [{ role: "user", text: "previous request" }] as const;
  await expect(
    judgeGear(apiKey, "current request", recent, { fetch: request }),
  ).resolves.toEqual({ score: 1.4, confidence: 0.8 });
  expect(request).toHaveBeenCalledOnce();
  const call = request.mock.calls[0];
  expect(String(call?.[0])).toMatch(/\/v1\/systemone$/);
  expect(JSON.parse(String(call?.[1]?.body)).state).toEqual({
    currentRequest: "current request",
    recent,
  });
});

test.each([
  {},
  { score: -0.1, confidence: 0.9 },
  { score: 2.1, confidence: 0.9 },
  { score: "1", confidence: 0.9 },
  { score: 1, confidence: -0.1 },
  { score: 1, confidence: 1.1 },
  { score: 1, confidence: null },
])(
  "invalid production judgment %j is rejected safely without retry",
  async (gear) => {
    const request = vi.fn<Fetch>(async () =>
      Response.json({ answers: { gear }, private: apiKey }),
    );
    await expect(
      judgeGear(apiKey, "request", [], { fetch: request }),
    ).rejects.toMatchObject({
      message: "TypeSafe returned an unexpected response.",
    });
    expect(request).toHaveBeenCalledOnce();
  },
);

test("network failure has actionable, sanitized diagnostics and no retry", async () => {
  const request = vi
    .fn<Fetch>()
    .mockRejectedValue(new Error(`private response ${apiKey}`));
  await expect(
    judgeGear(apiKey, "request", [], { fetch: request }),
  ).rejects.toMatchObject({
    message: "Could not connect to TypeSafe. Try again later.",
  });
  expect(request).toHaveBeenCalledOnce();
});

test("cancellation reaches the in-flight request without retry", async () => {
  const controller = new AbortController();
  const request = vi.fn<Fetch>(async (_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error("Missing request signal");
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("private abort details", "AbortError")),
        { once: true },
      );
      controller.abort();
      expect(signal.aborted).toBe(true);
    });
  });
  await expect(
    judgeGear(apiKey, "request", [], {
      fetch: request,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ message: "TypeSafe request was cancelled." });
  expect(request).toHaveBeenCalledOnce();
});

test("a stalled request times out without retry", async () => {
  const request = vi.fn<Fetch>(async (_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error("Missing request signal");
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("private timeout details", "AbortError")),
        { once: true },
      );
    });
  });
  await expect(
    judgeGear(apiKey, "request", [], { fetch: request, timeoutMs: 20 }),
  ).rejects.toMatchObject({
    message: "TypeSafe request timed out. Try again.",
  });
  expect(request).toHaveBeenCalledOnce();
});
