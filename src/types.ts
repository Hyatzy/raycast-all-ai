export type ProviderId = "mimo-payg" | "mimo-token-plan" | "deepseek" | "custom";

export type ReasoningEffort = "low" | "medium" | "high";

export type AuthMode = "bearer" | "api-key" | "x-api-key" | "none";

export type ModelOption = {
  id: string;
  ownedBy?: string;
};

export type Settings = {
  provider: ProviderId;
  apiKeys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  modelCache: Partial<Record<ProviderId, ModelOption[]>>;
  tokenPlanBaseUrl: string;
  tokenPlanCustomBaseUrl: string;
  customBaseUrl: string;
  customAuthMode: AuthMode;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  thinkingEnabled: boolean;
  reasoningEffort: ReasoningEffort;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  error?: string;
  createdAt: string;
  provider?: ProviderId;
  model?: string;
};
