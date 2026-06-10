import { Icon } from "@raycast/api";
import { AuthMode, ModelOption, ProviderId, Settings } from "./types";

export type ProviderSpec = {
  id: ProviderId;
  title: string;
  shortTitle: string;
  icon: Icon;
  keyPlaceholder: string;
  authMode: AuthMode;
  fallbackModels: ModelOption[];
  defaultModel: string;
  docsUrl: string;
  getBaseUrl: (settings: Settings) => string;
};

export const TOKEN_PLAN_BASE_URLS = [
  {
    title: "China Cluster",
    value: "https://token-plan-cn.xiaomimimo.com/v1",
  },
  {
    title: "Singapore Cluster",
    value: "https://token-plan-sgp.xiaomimimo.com/v1",
  },
  {
    title: "Europe Cluster",
    value: "https://token-plan-ams.xiaomimimo.com/v1",
  },
  {
    title: "Custom",
    value: "custom",
  },
];

export const MIMO_CHAT_MODELS: ModelOption[] = [
  { id: "mimo-v2.5-pro", ownedBy: "xiaomi-mimo" },
  { id: "mimo-v2.5", ownedBy: "xiaomi-mimo" },
  { id: "mimo-v2-flash", ownedBy: "xiaomi-mimo" },
  { id: "mimo-v2-pro", ownedBy: "xiaomi-mimo" },
  { id: "mimo-v2-omni", ownedBy: "xiaomi-mimo" },
];

export const DEEPSEEK_CHAT_MODELS: ModelOption[] = [
  { id: "deepseek-v4-flash", ownedBy: "deepseek" },
  { id: "deepseek-v4-pro", ownedBy: "deepseek" },
  { id: "deepseek-chat", ownedBy: "deepseek" },
  { id: "deepseek-reasoner", ownedBy: "deepseek" },
];

export const CUSTOM_FALLBACK_MODELS: ModelOption[] = [
  { id: "gpt-4o-mini", ownedBy: "openai-compatible" },
  { id: "deepseek-chat", ownedBy: "openai-compatible" },
  { id: "qwen-plus", ownedBy: "openai-compatible" },
];

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  "mimo-payg": {
    id: "mimo-payg",
    title: "Xiaomi MiMo Pay-as-you-go",
    shortTitle: "MiMo API",
    icon: Icon.Stars,
    keyPlaceholder: "sk-...",
    authMode: "api-key",
    fallbackModels: MIMO_CHAT_MODELS,
    defaultModel: "mimo-v2.5-pro",
    docsUrl: "https://platform.xiaomimimo.com/docs/en-US/api/chat/openai-api",
    getBaseUrl: () => "https://api.xiaomimimo.com/v1",
  },
  "mimo-token-plan": {
    id: "mimo-token-plan",
    title: "Xiaomi MiMo Token Plan",
    shortTitle: "MiMo Token",
    icon: Icon.Coins,
    keyPlaceholder: "tp-...",
    authMode: "api-key",
    fallbackModels: MIMO_CHAT_MODELS,
    defaultModel: "mimo-v2.5-pro",
    docsUrl: "https://platform.xiaomimimo.com/docs/en-US/tokenplan/quick-access",
    getBaseUrl: (settings) =>
      settings.tokenPlanBaseUrl === "custom"
        ? settings.tokenPlanCustomBaseUrl.trim()
        : settings.tokenPlanBaseUrl.trim(),
  },
  deepseek: {
    id: "deepseek",
    title: "DeepSeek",
    shortTitle: "DeepSeek",
    icon: Icon.Bolt,
    keyPlaceholder: "sk-...",
    authMode: "bearer",
    fallbackModels: DEEPSEEK_CHAT_MODELS,
    defaultModel: "deepseek-v4-flash",
    docsUrl: "https://api-docs.deepseek.com/",
    getBaseUrl: () => "https://api.deepseek.com",
  },
  custom: {
    id: "custom",
    title: "Custom OpenAI-compatible API",
    shortTitle: "Custom API",
    icon: Icon.Globe,
    keyPlaceholder: "sk-... / token",
    authMode: "bearer",
    fallbackModels: CUSTOM_FALLBACK_MODELS,
    defaultModel: "gpt-4o-mini",
    docsUrl: "https://platform.openai.com/docs/api-reference/chat/create",
    getBaseUrl: (settings) => settings.customBaseUrl.trim(),
  },
};

export function getProviderSpec(provider: ProviderId): ProviderSpec {
  return PROVIDERS[provider];
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function joinApiPath(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getEffectiveApiKey(settings: Settings, provider = settings.provider): string {
  return settings.apiKeys[provider]?.trim() ?? "";
}

export function getEffectiveAuthMode(settings: Settings): AuthMode {
  if (settings.provider === "custom") {
    return settings.customAuthMode;
  }
  return getProviderSpec(settings.provider).authMode;
}

export function getEffectiveModel(settings: Settings, provider = settings.provider): string {
  const spec = getProviderSpec(provider);
  return settings.models[provider]?.trim() || spec.defaultModel;
}

export function isMimoProvider(provider: ProviderId): boolean {
  return provider === "mimo-payg" || provider === "mimo-token-plan";
}

export function isDeepSeekProvider(provider: ProviderId): boolean {
  return provider === "deepseek";
}

export function filterChatModels(provider: ProviderId, models: ModelOption[]): ModelOption[] {
  if (!isMimoProvider(provider)) {
    return dedupeModels(models);
  }

  return dedupeModels(models).filter((model) => !/asr|tts/i.test(model.id));
}

function dedupeModels(models: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (!model.id || seen.has(model.id)) {
      return false;
    }
    seen.add(model.id);
    return true;
  });
}
