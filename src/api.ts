import {
  filterChatModels,
  getEffectiveApiKey,
  getEffectiveAuthMode,
  getEffectiveModel,
  getProviderSpec,
  isDeepSeekProvider,
  isMimoProvider,
  joinApiPath,
} from "./providers";
import { ChatMessage, ModelOption, Settings } from "./types";

type ApiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type StreamDelta = {
  content?: string;
  reasoning?: string;
};

export async function fetchOfficialModels(settings: Settings): Promise<ModelOption[]> {
  const provider = settings.provider;
  const spec = getProviderSpec(provider);
  const apiKey = getEffectiveApiKey(settings);
  const authMode = getEffectiveAuthMode(settings);
  const baseUrl = spec.getBaseUrl(settings);

  if (!apiKey && authMode !== "none") {
    return spec.fallbackModels;
  }

  if (!baseUrl) {
    throw new Error("Base URL is required");
  }

  const response = await fetch(joinApiPath(baseUrl, "/models"), {
    method: "GET",
    headers: buildHeaders(settings),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string; owned_by?: string }>;
  };

  const models =
    payload.data?.flatMap((model) => {
      if (!model.id) {
        return [];
      }
      return [{ id: model.id, ownedBy: model.owned_by }];
    }) ?? [];

  const chatModels = filterChatModels(provider, models);
  return chatModels.length > 0 ? chatModels : spec.fallbackModels;
}

export async function* streamChatCompletion(settings: Settings, messages: ChatMessage[]): AsyncGenerator<StreamDelta> {
  const spec = getProviderSpec(settings.provider);
  const apiKey = getEffectiveApiKey(settings);
  const authMode = getEffectiveAuthMode(settings);
  const model = getEffectiveModel(settings);
  const baseUrl = spec.getBaseUrl(settings);

  if (!apiKey && authMode !== "none") {
    throw new Error(`Missing API key for ${spec.title}`);
  }

  if (!model) {
    throw new Error(`Missing model for ${spec.title}`);
  }

  if (!baseUrl) {
    throw new Error(`Missing Base URL for ${spec.title}`);
  }

  const response = await fetch(joinApiPath(baseUrl, "/chat/completions"), {
    method: "POST",
    headers: buildHeaders(settings),
    body: JSON.stringify(buildChatBody(settings, messages)),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (!response.body) {
    throw new Error("The provider returned an empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]") {
        return;
      }

      const delta = parseStreamDelta(data);
      if (delta.content || delta.reasoning) {
        yield delta;
      }
    }
  }
}

export async function testChatConnection(settings: Settings): Promise<string> {
  const spec = getProviderSpec(settings.provider);
  const apiKey = getEffectiveApiKey(settings);
  const authMode = getEffectiveAuthMode(settings);
  const model = getEffectiveModel(settings);
  const baseUrl = spec.getBaseUrl(settings);

  if (!apiKey && authMode !== "none") {
    throw new Error(`Missing API key for ${spec.title}`);
  }

  if (!model) {
    throw new Error(`Missing model for ${spec.title}`);
  }

  if (!baseUrl) {
    throw new Error(`Missing Base URL for ${spec.title}`);
  }

  const response = await fetch(joinApiPath(baseUrl, "/chat/completions"), {
    method: "POST",
    headers: buildHeaders(settings),
    body: JSON.stringify(buildConnectionTestBody(settings)),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() || "Connected";
}

function buildHeaders(settings: Settings): Record<string, string> {
  const authMode = getEffectiveAuthMode(settings);
  const apiKey = getEffectiveApiKey(settings);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authMode === "api-key") {
    headers["api-key"] = apiKey;
  } else if (authMode === "x-api-key") {
    headers["x-api-key"] = apiKey;
  } else if (authMode === "bearer") {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function buildConnectionTestBody(settings: Settings): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: getEffectiveModel(settings),
    messages: [{ role: "user", content: "Reply with OK." }],
    stream: false,
    temperature: 0,
  };

  if (isMimoProvider(settings.provider)) {
    body.max_completion_tokens = 16;
    body.thinking = { type: "disabled" };
  } else {
    body.max_tokens = 16;
  }

  return body;
}

function buildChatBody(settings: Settings, messages: ChatMessage[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: getEffectiveModel(settings),
    messages: buildApiMessages(settings, messages),
    stream: true,
    temperature: settings.temperature,
    top_p: settings.topP,
  };

  if (isMimoProvider(settings.provider)) {
    body.max_completion_tokens = settings.maxTokens;
    body.thinking = { type: settings.thinkingEnabled ? "enabled" : "disabled" };
  } else if (isDeepSeekProvider(settings.provider)) {
    body.max_tokens = settings.maxTokens;
    if (settings.thinkingEnabled) {
      body.thinking = { type: "enabled" };
      body.reasoning_effort = settings.reasoningEffort;
    }
  } else {
    body.max_tokens = settings.maxTokens;
  }

  return body;
}

function buildApiMessages(settings: Settings, messages: ChatMessage[]): ApiMessage[] {
  const apiMessages: ApiMessage[] = [];
  if (settings.systemPrompt.trim()) {
    apiMessages.push({ role: "system", content: settings.systemPrompt.trim() });
  }

  const recentMessages = messages.slice(-24);
  for (const message of recentMessages) {
    if (message.error || !message.content.trim()) {
      continue;
    }
    apiMessages.push({
      role: message.role,
      content: message.content,
    });
  }

  return apiMessages;
}

function parseStreamDelta(data: string): StreamDelta {
  try {
    const payload = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string | null;
          reasoning_content?: string | null;
        };
      }>;
    };
    const delta = payload.choices?.[0]?.delta;
    return {
      content: delta?.content ?? undefined,
      reasoning: delta?.reasoning_content ?? undefined,
    };
  } catch {
    return {};
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `${response.status} ${response.statusText}`;
  }

  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return payload.error?.message || payload.message || text;
  } catch {
    return text;
  }
}
