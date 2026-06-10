import { LocalStorage } from "@raycast/api";
import { TOKEN_PLAN_BASE_URLS } from "./providers";
import { ChatMessage, Settings } from "./types";

const SETTINGS_KEY = "settings.v1";
const CHAT_MESSAGES_KEY = "chat-messages.v1";

export const DEFAULT_SETTINGS: Settings = {
  provider: "mimo-payg",
  apiKeys: {},
  models: {
    "mimo-payg": "mimo-v2.5-pro",
    "mimo-token-plan": "mimo-v2.5-pro",
    deepseek: "deepseek-v4-flash",
    custom: "gpt-4o-mini",
  },
  modelCache: {},
  tokenPlanBaseUrl: TOKEN_PLAN_BASE_URLS[0].value,
  tokenPlanCustomBaseUrl: "",
  customBaseUrl: "",
  customAuthMode: "bearer",
  systemPrompt: "You are a helpful AI assistant. Answer clearly and concisely.",
  temperature: 1,
  topP: 0.95,
  maxTokens: 4096,
  thinkingEnabled: false,
  reasoningEffort: "medium",
};

export async function loadSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiKeys: {
      ...DEFAULT_SETTINGS.apiKeys,
      ...stored.apiKeys,
    },
    models: {
      ...DEFAULT_SETTINGS.models,
      ...stored.models,
    },
    modelCache: {
      ...DEFAULT_SETTINGS.modelCache,
      ...stored.modelCache,
    },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await LocalStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadChatMessages(): Promise<ChatMessage[]> {
  return readJson<ChatMessage[]>(CHAT_MESSAGES_KEY, []);
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  await LocalStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
}

export async function clearChatMessages(): Promise<void> {
  await LocalStorage.removeItem(CHAT_MESSAGES_KEY);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
