import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  type Fetch,
  noul,
  score,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import * as z from "zod";

export class TypeSafeRequestError extends Error {
  override readonly name = "TypeSafeRequestError";

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const safeRequestError = (error: unknown): TypeSafeRequestError => {
  if (error instanceof APIUserAbortError) {
    return new TypeSafeRequestError("TypeSafe request was cancelled.");
  }
  if (error instanceof APITimeoutError) {
    return new TypeSafeRequestError("TypeSafe request timed out. Try again.");
  }
  if (error instanceof APIError) {
    if (error.status === 401) {
      return new TypeSafeRequestError(
        "TypeSafe rejected the API key.",
        error.status,
      );
    }
    if (error.status === 403) {
      return new TypeSafeRequestError(
        "TypeSafe denied access. Check the account and model permissions.",
        error.status,
      );
    }
    if (error.status === 429) {
      return new TypeSafeRequestError(
        "TypeSafe rate-limited the request. Try again later.",
        error.status,
      );
    }
    return new TypeSafeRequestError(
      `TypeSafe request failed with HTTP ${error.status}. Try again later.`,
      error.status,
    );
  }
  if (error instanceof APIConnectionError) {
    return new TypeSafeRequestError(
      "Could not connect to TypeSafe. Try again later.",
    );
  }
  return new TypeSafeRequestError("TypeSafe returned an unexpected response.");
};

type ClientOptions = {
  fetch?: Fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const createClient = (apiKey: string, options: ClientOptions): TypeSafeClient =>
  new TypeSafeClient({
    apiKey,
    baseURL: "https://api.typesafe.ai",
    defaultModel: "jev-latest",
    timeout: options.timeoutMs ?? 5_000,
    retry: { maxRetries: 0 },
    logLevel: "off",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

export const verifyApiKey = async (
  apiKey: string,
  options: ClientOptions = {},
): Promise<number> => {
  const client = createClient(apiKey, options);

  try {
    const models = await client.models.list(
      options.signal ? { signal: options.signal } : {},
    );
    return models.length;
  } catch (error) {
    if (error instanceof TypeSafeRequestError) throw error;
    throw safeRequestError(error);
  }
};

export type CliCommandJudgment = {
  isCliCommand: boolean;
  probability: number;
  model: string;
  inputTokens: number;
};

const cliCommandResponseSchema = z.object({
  answers: z.object({
    cliCommand: z.object({
      noul: z.number().min(0).max(1),
    }),
  }),
  model: z.string().min(1),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
  }),
});

export const judgeCliCommand = async (
  apiKey: string,
  input: string,
  options: ClientOptions = {},
): Promise<CliCommandJudgment> => {
  const client = createClient(apiKey, options);

  try {
    const response = await client.systemOne(
      {
        state: { input },
        questions: {
          cliCommand: noul("Is `input` looks like a executable CLI command?", {
            true: "input looks like a CLI command",
            false: "input does not seem to be executable command",
          }),
        },
      },
      options.signal ? { signal: options.signal } : {},
    );
    const result = cliCommandResponseSchema.parse(response);
    const probability = result.answers.cliCommand.noul;
    const inputTokens = result.usage.input_tokens;

    return {
      isCliCommand: probability >= 0.5,
      probability,
      model: result.model,
      inputTokens,
    };
  } catch (error) {
    if (error instanceof TypeSafeRequestError) throw error;
    throw safeRequestError(error);
  }
};

export type GearJudgment = {
  score: number;
  confidence: number;
};

export type RecentMessage = {
  role: "user" | "assistant";
  text: string;
};

const gearResponseSchema = z.object({
  answers: z.object({
    gear: z.object({
      score: z.number().min(0).max(2),
      confidence: z.number().min(0).max(1),
    }),
  }),
});

export const judgeGear = async (
  apiKey: string,
  currentRequest: string,
  recent: readonly RecentMessage[],
  options: ClientOptions = {},
): Promise<GearJudgment> => {
  const client = createClient(apiKey, options);

  try {
    const response = await client.systemOne(
      {
        state: {
          currentRequest,
          recent: [...recent],
        },
        questions: {
          gear: score(
            {
              context:
                "This score selects the model and thinking level for the next turn of Pi, a coding agent that can inspect repositories, edit files, run commands, and use tools. The user has configured light, standard, and heavy in increasing capability or compute order.",
              objective:
                "Rate the lowest capability level likely to complete currentRequest correctly and efficiently without avoidable retries or user correction.",
              guidance: [
                "Judge the capability needed for the next turn, not the general importance of the topic.",
                "Treat currentRequest as authoritative. Use recent only to resolve references, omitted context, and follow-up intent.",
                "Do not inherit earlier difficulty when currentRequest is independent.",
                "Consider reasoning depth, ambiguity, repository scope, debugging subtlety, risk, and the cost of failure.",
              ],
            },
            [
              "Light: straightforward, well-scoped work with an obvious approach, such as formatting, a simple lookup, a mechanical edit, or a small low-risk change.",
              "Standard: typical coding-agent work requiring repository inspection, implementation decisions, debugging, or coordinated changes with moderate uncertainty.",
              "Heavy: work requiring unusually deep reasoning or caution, such as subtle root-cause analysis, architecture decisions, broad refactors, security-sensitive changes, high ambiguity, or high-cost failure.",
            ],
          ),
        },
      },
      options.signal ? { signal: options.signal } : {},
    );
    const result = gearResponseSchema.parse(response);

    return {
      score: result.answers.gear.score,
      confidence: result.answers.gear.confidence,
    };
  } catch (error) {
    if (error instanceof TypeSafeRequestError) throw error;
    throw safeRequestError(error);
  }
};
