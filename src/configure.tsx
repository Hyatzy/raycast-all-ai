import { Action, ActionPanel, Detail, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchOfficialModels, testChatConnection } from "./api";
import { getProviderSpec, PROVIDERS, TOKEN_PLAN_BASE_URLS } from "./providers";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./storage";
import { AuthMode, ModelOption, ProviderId, ReasoningEffort, Settings } from "./types";

type ConfigureViewProps = {
  onSave?: (settings: Settings) => void;
};

type SubmitValues = {
  customModel?: string;
};

export default function ConfigureCommand() {
  return <ConfigureView />;
}

export function ConfigureView({ onSave }: ConfigureViewProps) {
  const { pop } = useNavigation();
  const [storedSettings, setStoredSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_SETTINGS.provider);
  const [mimoApiKey, setMimoApiKey] = useState("");
  const [tokenPlanApiKey, setTokenPlanApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [tokenPlanBaseUrl, setTokenPlanBaseUrl] = useState(DEFAULT_SETTINGS.tokenPlanBaseUrl);
  const [tokenPlanCustomBaseUrl, setTokenPlanCustomBaseUrl] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState(DEFAULT_SETTINGS.customBaseUrl);
  const [customAuthMode, setCustomAuthMode] = useState<AuthMode>(DEFAULT_SETTINGS.customAuthMode);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.provider] ?? "");
  const [customModel, setCustomModel] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SETTINGS.systemPrompt);
  const [temperature, setTemperature] = useState(String(DEFAULT_SETTINGS.temperature));
  const [topP, setTopP] = useState(String(DEFAULT_SETTINGS.topP));
  const [maxTokens, setMaxTokens] = useState(String(DEFAULT_SETTINGS.maxTokens));
  const [thinkingEnabled, setThinkingEnabled] = useState(DEFAULT_SETTINGS.thinkingEnabled);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_SETTINGS.reasoningEffort);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modelNotice, setModelNotice] = useState("");
  const selectedModelRef = useRef(selectedModel);

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setStoredSettings(settings);
      setProvider(settings.provider);
      setMimoApiKey(settings.apiKeys["mimo-payg"] ?? "");
      setTokenPlanApiKey(settings.apiKeys["mimo-token-plan"] ?? "");
      setDeepseekApiKey(settings.apiKeys.deepseek ?? "");
      setCustomApiKey(settings.apiKeys.custom ?? "");
      setTokenPlanBaseUrl(settings.tokenPlanBaseUrl);
      setTokenPlanCustomBaseUrl(settings.tokenPlanCustomBaseUrl);
      setCustomBaseUrl(settings.customBaseUrl);
      setCustomAuthMode(settings.customAuthMode);
      setSystemPrompt(settings.systemPrompt);
      setTemperature(String(settings.temperature));
      setTopP(String(settings.topP));
      setMaxTokens(String(settings.maxTokens));
      setThinkingEnabled(settings.thinkingEnabled);
      setReasoningEffort(settings.reasoningEffort);
      applyModelsForProvider(settings.provider, settings);
    })();
  }, []);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const currentSpec = useMemo(() => getProviderSpec(provider), [provider]);

  const currentApiKey = useMemo(() => {
    if (provider === "mimo-payg") {
      return mimoApiKey.trim();
    }
    if (provider === "mimo-token-plan") {
      return tokenPlanApiKey.trim();
    }
    if (provider === "custom") {
      return customApiKey.trim();
    }
    return deepseekApiKey.trim();
  }, [customApiKey, deepseekApiKey, mimoApiKey, provider, tokenPlanApiKey]);

  const currentBaseUrl = useMemo(
    () => currentSpec.getBaseUrl(buildDraftSettings()),
    [
      currentSpec,
      customAuthMode,
      customBaseUrl,
      customApiKey,
      deepseekApiKey,
      mimoApiKey,
      provider,
      tokenPlanApiKey,
      tokenPlanBaseUrl,
      tokenPlanCustomBaseUrl,
    ],
  );

  const refreshModels = useCallback(
    async (silent = false) => {
      const currentSelectedModel = selectedModelRef.current;
      const draft = buildDraftSettings(currentSelectedModel);
      const apiKey = getDraftApiKey(draft.provider, draft);
      const authMode = getDraftAuthMode(draft.provider, draft);

      if (!apiKey) {
        if (authMode === "none") {
          setModelNotice("Fetching official models without authentication...");
        } else {
          setModels(currentSpec.fallbackModels);
          setModelNotice("Enter an API key to fetch official models.");
          return;
        }
      }

      if (!currentSpec.getBaseUrl(draft)) {
        setModels(currentSpec.fallbackModels);
        setModelNotice("Enter a Base URL to fetch official models.");
        return;
      }

      setIsRefreshing(true);
      setModelNotice("Fetching official models...");
      try {
        const officialModels = await fetchOfficialModels(draft);
        setModels(officialModels);
        setModelNotice(`Loaded ${officialModels.length} model${officialModels.length === 1 ? "" : "s"} from provider.`);
        if (!officialModels.some((model) => model.id === currentSelectedModel)) {
          setSelectedModel(officialModels[0]?.id ?? currentSpec.defaultModel);
        }
        if (!silent) {
          await showToast({
            style: Toast.Style.Success,
            title: "Models refreshed",
            message: currentSpec.shortTitle,
          });
        }
      } catch (error) {
        setModels(currentSpec.fallbackModels);
        setModelNotice(`Could not fetch models. Showing documented defaults. ${getErrorMessage(error)}`);
        if (!silent) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Failed to refresh models",
            message: getErrorMessage(error),
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [
      currentSpec,
      customApiKey,
      customAuthMode,
      customBaseUrl,
      deepseekApiKey,
      mimoApiKey,
      provider,
      reasoningEffort,
      systemPrompt,
      temperature,
      thinkingEnabled,
      tokenPlanApiKey,
      tokenPlanBaseUrl,
      tokenPlanCustomBaseUrl,
      topP,
      maxTokens,
    ],
  );

  useEffect(() => {
    if (!storedSettings) {
      return;
    }

    const providerModels = storedSettings.modelCache[provider] ?? currentSpec.fallbackModels;
    setModels(providerModels);
    setSelectedModel(storedSettings.models[provider] ?? providerModels[0]?.id ?? currentSpec.defaultModel);
    setCustomModel("");
    setModelNotice(
      currentApiKey || customAuthMode === "none"
        ? "Waiting to refresh official models..."
        : "Enter an API key to fetch official models.",
    );

    if (!currentBaseUrl) {
      return;
    }

    if (customAuthMode !== "none" && currentApiKey.length < 6) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshModels(true);
    }, 700);

    return () => clearTimeout(timer);
  }, [currentApiKey, currentBaseUrl, currentSpec, customAuthMode, provider, refreshModels, storedSettings]);

  if (!storedSettings) {
    return <Detail isLoading markdown="Loading configuration..." />;
  }

  async function handleSubmit(values: SubmitValues) {
    const model = (values.customModel ?? customModel).trim() || selectedModel.trim();
    const nextSettings = buildDraftSettings(model);

    if (!currentSpec.getBaseUrl(nextSettings)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Base URL required",
        message: getProviderSpec(nextSettings.provider).shortTitle,
      });
      return;
    }

    if (
      getDraftAuthMode(nextSettings.provider, nextSettings) !== "none" &&
      !getDraftApiKey(nextSettings.provider, nextSettings)
    ) {
      await showToast({
        style: Toast.Style.Failure,
        title: "API key required",
        message: getProviderSpec(nextSettings.provider).shortTitle,
      });
      return;
    }

    if (!model) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Model required",
      });
      return;
    }

    const officialOrFallbackModels = models.length > 0 ? models : getProviderSpec(nextSettings.provider).fallbackModels;
    nextSettings.modelCache = {
      ...nextSettings.modelCache,
      [nextSettings.provider]: officialOrFallbackModels,
    };
    nextSettings.models = {
      ...nextSettings.models,
      [nextSettings.provider]: model,
    };

    await saveSettings(nextSettings);
    setStoredSettings(nextSettings);
    onSave?.(nextSettings);
    await showToast({
      style: Toast.Style.Success,
      title: "Configuration saved",
      message: `${getProviderSpec(nextSettings.provider).shortTitle} · ${model}`,
    });

    if (onSave) {
      pop();
    }
  }

  async function handleTestConnection() {
    const model = customModel.trim() || selectedModel.trim();
    const draft = buildDraftSettings(model);
    const spec = getProviderSpec(draft.provider);

    if (!spec.getBaseUrl(draft)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Base URL required",
        message: spec.shortTitle,
      });
      return;
    }

    if (getDraftAuthMode(draft.provider, draft) !== "none" && !getDraftApiKey(draft.provider, draft)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "API key required",
        message: spec.shortTitle,
      });
      return;
    }

    if (!model) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Model required",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Testing connection...",
      message: `${spec.shortTitle} · ${model}`,
    });

    try {
      const reply = await testChatConnection(draft);
      toast.style = Toast.Style.Success;
      toast.title = "Connection works";
      toast.message = reply.slice(0, 80);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Connection failed";
      toast.message = getErrorMessage(error).slice(0, 120);
    }
  }

  function handleProviderChange(nextProvider: string) {
    const providerId = nextProvider as ProviderId;
    setProvider(providerId);
    if (!storedSettings) {
      return;
    }
    applyModelsForProvider(providerId, storedSettings);
  }

  function applyModelsForProvider(providerId: ProviderId, settings: Settings) {
    const spec = getProviderSpec(providerId);
    const providerModels = settings.modelCache[providerId] ?? spec.fallbackModels;
    setModels(providerModels);
    setSelectedModel(settings.models[providerId] ?? providerModels[0]?.id ?? spec.defaultModel);
  }

  function buildDraftSettings(model = selectedModel): Settings {
    return {
      ...(storedSettings ?? DEFAULT_SETTINGS),
      provider,
      apiKeys: {
        "mimo-payg": mimoApiKey.trim(),
        "mimo-token-plan": tokenPlanApiKey.trim(),
        deepseek: deepseekApiKey.trim(),
        custom: customApiKey.trim(),
      },
      models: {
        ...(storedSettings ?? DEFAULT_SETTINGS).models,
        [provider]: model.trim(),
      },
      tokenPlanBaseUrl,
      tokenPlanCustomBaseUrl,
      customBaseUrl,
      customAuthMode,
      systemPrompt,
      temperature: parseNumber(temperature, DEFAULT_SETTINGS.temperature),
      topP: parseNumber(topP, DEFAULT_SETTINGS.topP),
      maxTokens: Math.max(1, Math.floor(parseNumber(maxTokens, DEFAULT_SETTINGS.maxTokens))),
      thinkingEnabled,
      reasoningEffort,
    };
  }

  const modelItems = ensureModelVisible(models.length > 0 ? models : currentSpec.fallbackModels, selectedModel);
  const effectiveBaseUrl =
    provider === "mimo-token-plan" && tokenPlanBaseUrl === "custom"
      ? tokenPlanCustomBaseUrl
      : currentSpec.getBaseUrl(buildDraftSettings());

  return (
    <Form
      isLoading={isRefreshing}
      navigationTitle="Configure Provider"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Configuration" icon={Icon.CheckCircle} onSubmit={handleSubmit} />
          <Action
            title="Test Connection"
            icon={Icon.Bolt}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onAction={() => void handleTestConnection()}
          />
          <Action
            title="Refresh Official Models"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => void refreshModels(false)}
          />
          <Action.OpenInBrowser title={`Open ${currentSpec.shortTitle} Docs`} url={currentSpec.docsUrl} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="provider" title="Provider" value={provider} onChange={handleProviderChange}>
        {Object.values(PROVIDERS).map((providerSpec) => (
          <Form.Dropdown.Item key={providerSpec.id} value={providerSpec.id} title={providerSpec.title} />
        ))}
      </Form.Dropdown>

      <Form.PasswordField
        id="mimoApiKey"
        title="MiMo API Key"
        placeholder="sk-..."
        value={mimoApiKey}
        onChange={setMimoApiKey}
        info="Pay-as-you-go API key from Xiaomi MiMo Open Platform."
      />
      <Form.PasswordField
        id="tokenPlanApiKey"
        title="MiMo Token Plan Key"
        placeholder="tp-..."
        value={tokenPlanApiKey}
        onChange={setTokenPlanApiKey}
        info="Token Plan keys are independent from pay-as-you-go API keys."
      />
      <Form.PasswordField
        id="deepseekApiKey"
        title="DeepSeek API Key"
        placeholder="sk-..."
        value={deepseekApiKey}
        onChange={setDeepseekApiKey}
      />
      <Form.PasswordField
        id="customApiKey"
        title="Custom API Key"
        placeholder="sk-... / token"
        value={customApiKey}
        onChange={setCustomApiKey}
        info="Used only by the Custom OpenAI-compatible API provider."
      />

      {provider === "mimo-token-plan" ? (
        <>
          <Form.Dropdown
            id="tokenPlanBaseUrl"
            title="Token Plan Base URL"
            value={tokenPlanBaseUrl}
            onChange={setTokenPlanBaseUrl}
          >
            {TOKEN_PLAN_BASE_URLS.map((item) => (
              <Form.Dropdown.Item key={item.value} value={item.value} title={item.title} />
            ))}
          </Form.Dropdown>
          {tokenPlanBaseUrl === "custom" ? (
            <Form.TextField
              id="tokenPlanCustomBaseUrl"
              title="Custom Base URL"
              placeholder="https://token-plan-...xiaomimimo.com/v1"
              value={tokenPlanCustomBaseUrl}
              onChange={setTokenPlanCustomBaseUrl}
            />
          ) : null}
        </>
      ) : null}

      {provider === "custom" ? (
        <>
          <Form.TextField
            id="customBaseUrl"
            title="Custom Base URL"
            placeholder="https://api.example.com/v1"
            value={customBaseUrl}
            onChange={setCustomBaseUrl}
            info="Must be an OpenAI-compatible base URL. The extension calls /models and /chat/completions under it."
          />
          <Form.Dropdown
            id="customAuthMode"
            title="Custom Auth"
            value={customAuthMode}
            onChange={(value) => setCustomAuthMode(value as AuthMode)}
          >
            <Form.Dropdown.Item value="bearer" title="Authorization: Bearer <key>" />
            <Form.Dropdown.Item value="api-key" title="api-key: <key>" />
            <Form.Dropdown.Item value="x-api-key" title="x-api-key: <key>" />
            <Form.Dropdown.Item value="none" title="No Auth Header" />
          </Form.Dropdown>
        </>
      ) : null}

      <Form.Description title="Effective Base URL" text={effectiveBaseUrl || "Not configured"} />
      <Form.Description
        title="Model Source"
        text={modelNotice || "Models are loaded from cache or documented defaults."}
      />

      <Form.Dropdown id="model" title="Model" value={selectedModel} onChange={setSelectedModel}>
        {modelItems.map((model) => (
          <Form.Dropdown.Item
            key={model.id}
            value={model.id}
            title={model.ownedBy ? `${model.id} · ${model.ownedBy}` : model.id}
          />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="customModel"
        title="Custom Model"
        placeholder="Optional model id, overrides dropdown"
        value={customModel}
        onChange={setCustomModel}
      />

      <Form.Separator />
      <Form.TextArea
        id="systemPrompt"
        title="System Prompt"
        value={systemPrompt}
        onChange={setSystemPrompt}
        enableMarkdown
      />
      <Form.TextField id="temperature" title="Temperature" value={temperature} onChange={setTemperature} />
      <Form.TextField id="topP" title="Top P" value={topP} onChange={setTopP} />
      <Form.TextField id="maxTokens" title="Max Output Tokens" value={maxTokens} onChange={setMaxTokens} />
      <Form.Checkbox
        id="thinkingEnabled"
        title="Thinking"
        label="Enable thinking mode"
        value={thinkingEnabled}
        onChange={setThinkingEnabled}
      />
      <Form.Dropdown
        id="reasoningEffort"
        title="DeepSeek Reasoning Effort"
        value={reasoningEffort}
        onChange={(value) => setReasoningEffort(value as ReasoningEffort)}
      >
        <Form.Dropdown.Item value="low" title="Low" />
        <Form.Dropdown.Item value="medium" title="Medium" />
        <Form.Dropdown.Item value="high" title="High" />
      </Form.Dropdown>
    </Form>
  );
}

function getDraftApiKey(provider: ProviderId, settings: Settings): string {
  return settings.apiKeys[provider]?.trim() ?? "";
}

function getDraftAuthMode(provider: ProviderId, settings: Settings): AuthMode {
  if (provider === "custom") {
    return settings.customAuthMode;
  }
  return getProviderSpec(provider).authMode;
}

function ensureModelVisible(models: ModelOption[], selectedModel: string): ModelOption[] {
  if (!selectedModel || models.some((model) => model.id === selectedModel)) {
    return models;
  }
  return [{ id: selectedModel, ownedBy: "saved" }, ...models];
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
