import type { ImageMimeType } from "@doodle/shared";

import type { ServerEnv } from "../config/env";

export type ImageModerationAction = "allow" | "review" | "block";
export type ImageModerationRiskLevel = "low" | "medium" | "high";

export interface ImageModerationInput {
  buffer: Buffer;
  filename: string;
  mimeType: ImageMimeType;
}

export interface ImageModerationResult {
  allowed: boolean;
  riskLevel: ImageModerationRiskLevel;
  action: ImageModerationAction;
  categories: string[];
  message: string | null;
}

export interface ImageModerationClient {
  moderate(input: ImageModerationInput): Promise<ImageModerationResult>;
}

export class AiImageModerationClient implements ImageModerationClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  public constructor(
    env: Pick<
      ServerEnv,
      "AI_SERVER_BASE_URL" | "AI_SERVER_API_KEY" | "AI_SERVER_TIMEOUT_SECONDS"
    >
  ) {
    this.baseUrl = env.AI_SERVER_BASE_URL.replace(/\/+$/, "");
    this.apiKey = env.AI_SERVER_API_KEY;
    this.timeoutMs = parseTimeoutMs(env.AI_SERVER_TIMEOUT_SECONDS);
  }

  public async moderate(input: ImageModerationInput): Promise<ImageModerationResult> {
    const form = new FormData();
    const arrayBuffer = input.buffer.buffer.slice(
      input.buffer.byteOffset,
      input.buffer.byteOffset + input.buffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: input.mimeType });
    form.append("image", blob, input.filename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/ai/image/moderate`, {
        method: "POST",
        headers: {
          "X-Internal-Api-Key": this.apiKey
        },
        body: form,
        signal: controller.signal
      });
      const body = await parseJsonBody(response);

      if (!response.ok || body.success !== true) {
        throw new Error("AI image moderation request failed");
      }

      return parseModerationResult(body.data);
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = await response.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function parseModerationResult(value: unknown): ImageModerationResult {
  if (!isRecord(value)) {
    throw new Error("AI image moderation response is invalid");
  }

  const action = value.action;
  const riskLevel = value.risk_level;

  if (
    !isModerationAction(action) ||
    !isRiskLevel(riskLevel) ||
    typeof value.allowed !== "boolean"
  ) {
    throw new Error("AI image moderation response is invalid");
  }

  return {
    allowed: value.allowed,
    riskLevel,
    action,
    categories: Array.isArray(value.categories)
      ? value.categories.filter(
          (category): category is string => typeof category === "string"
        )
      : [],
    message: typeof value.message === "string" ? value.message : null
  };
}

function parseTimeoutMs(value: string): number {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 20_000;
  }

  return Math.round(seconds * 1000);
}

function isModerationAction(value: unknown): value is ImageModerationAction {
  return value === "allow" || value === "review" || value === "block";
}

function isRiskLevel(value: unknown): value is ImageModerationRiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
