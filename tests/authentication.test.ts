import type { Fetch } from "@typesafe-ai/sdk";
import { expect, test } from "vitest";
import { judgeCliCommand, verifyApiKey } from "../src/typesafe.js";

const apiKey = "test-key-0123456789abcdef";
const modelResponse = {
  models: [{ name: "jev-latest", description: "", release_date: "2026-01-01" }],
};

test("verifies API keys through the TypeSafe model endpoint", async () => {
  const fetch: Fetch = async (input) => {
    expect(String(input)).toMatch(/\/v1\/models$/);
    return Response.json(modelResponse);
  };

  await expect(verifyApiKey(apiKey, { fetch })).resolves.toBe(1);
});

test("validates and maps CLI command judgments", async () => {
  const fetch: Fetch = async (input) => {
    expect(String(input)).toMatch(/\/v1\/systemone$/);
    return Response.json({
      answers: { cliCommand: { noul: 0.75 } },
      model: "jev-latest",
      usage: { input_tokens: 12 },
    });
  };

  await expect(
    judgeCliCommand(apiKey, "git status", { fetch }),
  ).resolves.toEqual({
    isCliCommand: true,
    probability: 0.75,
    model: "jev-latest",
    inputTokens: 12,
  });
});

test("rejects malformed CLI command judgments", async () => {
  const fetch: Fetch = async () =>
    Response.json({
      answers: { cliCommand: { noul: 2 } }, // Invalid probability
      model: "jev-latest",
      usage: { input_tokens: 12 },
    });

  await expect(
    judgeCliCommand(apiKey, "git status", { fetch }),
  ).rejects.toMatchObject({
    message: "TypeSafe returned an unexpected response.",
  });
});

test("does not expose the API key or upstream response in authentication errors", async () => {
  const secret = "secret-key-0123456789abcdef";
  const fetch: Fetch = async () =>
    Response.json(
      { error: { message: `rejected ${secret}` } },
      { status: 401 },
    );

  const error = await verifyApiKey(secret, { fetch }).catch(
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ message: "TypeSafe rejected the API key." });
  expect((error as Error).message).not.toContain(secret);
});
