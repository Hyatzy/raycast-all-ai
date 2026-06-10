import { Action, ActionPanel, Clipboard, Form, Icon, List, showToast, Toast, useNavigation } from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchOfficialModels, streamChatCompletion } from "./api";
import { ConfigureView } from "./configure";
import { getEffectiveApiKey, getEffectiveModel, getProviderSpec } from "./providers";
import { clearChatMessages, loadChatMessages, loadSettings, saveChatMessages, saveSettings } from "./storage";
import { ChatMessage, Settings } from "./types";

type AskFormValues = {
  prompt: string;
};

export default function ChatCommand() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  const providerSpec = settings ? getProviderSpec(settings.provider) : null;
  const selectedModel = settings ? getEffectiveModel(settings) : "";
  const apiKey = settings ? getEffectiveApiKey(settings) : "";
  const newestFirstMessages = useMemo(() => [...messages].reverse(), [messages]);
  const latestMessage = newestFirstMessages[0];
  const lastAssistantMessage = newestFirstMessages.find((message) => message.role === "assistant" && message.content);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      if (!settings) {
        return;
      }

      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        await showToast({ style: Toast.Style.Failure, title: "Prompt is empty" });
        return;
      }

      if (!getEffectiveApiKey(settings)) {
        await showToast({ style: Toast.Style.Failure, title: "Configure an API key first" });
        return;
      }

      const userMessage = createMessage("user", trimmedPrompt, settings);
      const assistantMessage = createMessage("assistant", "", settings);
      const baseMessages = [...messages, userMessage, assistantMessage];
      setMessages(baseMessages);
      setSelectedMessageId(assistantMessage.id);
      await saveChatMessages(baseMessages);
      setIsStreaming(true);

      let content = "";
      let reasoning = "";
      let latestMessages = baseMessages;

      try {
        for await (const delta of streamChatCompletion(settings, [...messages, userMessage])) {
          content += delta.content ?? "";
          reasoning += delta.reasoning ?? "";
          latestMessages = baseMessages.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content,
                  reasoning,
                }
              : message,
          );
          setMessages(latestMessages);
        }
      } catch (error) {
        latestMessages = baseMessages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                error: getErrorMessage(error),
                content: content || "Request failed.",
                reasoning,
              }
            : message,
        );
        setMessages(latestMessages);
        await showToast({
          style: Toast.Style.Failure,
          title: "AI request failed",
          message: getErrorMessage(error),
        });
      } finally {
        setIsStreaming(false);
        await saveChatMessages(latestMessages);
      }
    },
    [messages, settings],
  );

  async function reload() {
    setIsLoading(true);
    const [loadedSettings, loadedMessages] = await Promise.all([loadSettings(), loadChatMessages()]);
    setSettings(loadedSettings);
    setMessages(loadedMessages);
    setSelectedMessageId(loadedMessages.at(-1)?.id);
    setIsLoading(false);
  }

  async function handleRefreshModels() {
    if (!settings) {
      return;
    }

    try {
      const officialModels = await fetchOfficialModels(settings);
      const currentModel = getEffectiveModel(settings);
      const nextModel = officialModels.some((model) => model.id === currentModel)
        ? currentModel
        : (officialModels[0]?.id ?? currentModel);
      const nextSettings: Settings = {
        ...settings,
        modelCache: {
          ...settings.modelCache,
          [settings.provider]: officialModels,
        },
        models: {
          ...settings.models,
          [settings.provider]: nextModel,
        },
      };
      await saveSettings(nextSettings);
      setSettings(nextSettings);
      await showToast({
        style: Toast.Style.Success,
        title: "Models refreshed",
        message: `${officialModels.length} loaded`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to refresh models",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleClearChat() {
    await clearChatMessages();
    setMessages([]);
    setSelectedMessageId(undefined);
    await showToast({ style: Toast.Style.Success, title: "Chat cleared" });
  }

  async function askClipboard() {
    const text = await Clipboard.readText();
    if (!text?.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Clipboard is empty" });
      return;
    }
    await sendPrompt(text);
  }

  function renderActions(message?: ChatMessage) {
    return (
      <ActionPanel>
        <Action.Push
          title="Ask"
          icon={Icon.Message}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
          target={<AskForm onSubmit={sendPrompt} />}
        />
        <Action
          title="Ask Clipboard"
          icon={Icon.Clipboard}
          shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
          onAction={() => void askClipboard()}
        />
        <Action.Push
          title="Configure Provider"
          icon={Icon.Gear}
          shortcut={{ modifiers: ["cmd"], key: "," }}
          target={<ConfigureView onSave={setSettings} />}
        />
        <Action
          title="Refresh Official Models"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={() => void handleRefreshModels()}
        />
        {message?.content ? <Action.CopyToClipboard title="Copy Selected Message" content={message.content} /> : null}
        {lastAssistantMessage ? (
          <Action.CopyToClipboard title="Copy Last Response" content={lastAssistantMessage.content} />
        ) : null}
        <Action
          title="Clear Chat"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
          onAction={() => void handleClearChat()}
        />
      </ActionPanel>
    );
  }

  const emptyTitle = apiKey ? "No Messages" : "Configure a Provider";
  const emptyDescription = apiKey
    ? "Use Ask to start a conversation."
    : "Enter an API key and choose a model before chatting.";

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      navigationTitle={providerSpec ? `${providerSpec.shortTitle} Chat` : "AI Chat"}
      searchBarPlaceholder="Search messages..."
      selectedItemId={selectedMessageId ?? latestMessage?.id}
      onSelectionChange={(id) => setSelectedMessageId(id ?? undefined)}
    >
      <List.EmptyView title={emptyTitle} description={emptyDescription} icon={Icon.Message} actions={renderActions()} />
      {newestFirstMessages.map((message, index) => {
        const isLatest = index === 0;
        const isGenerating = isStreaming && isLatest && message.role === "assistant";

        return (
          <List.Item
            key={message.id}
            id={message.id}
            icon={message.role === "user" ? Icon.Person : Icon.Stars}
            title={message.role === "user" ? "You" : "Assistant"}
            subtitle={previewText(message)}
            accessories={[
              ...(isLatest ? [{ text: "Latest" }] : []),
              ...(message.error ? [{ icon: Icon.ExclamationMark }] : []),
              { text: formatTime(message.createdAt) },
            ]}
            detail={
              <List.Item.Detail
                isLoading={isGenerating}
                markdown={formatMessageDetail(message, isGenerating)}
                metadata={
                  settings && providerSpec ? (
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="Provider" text={providerSpec.title} />
                      <List.Item.Detail.Metadata.Label title="Model" text={message.model || selectedModel} />
                      <List.Item.Detail.Metadata.Label
                        title="Role"
                        text={message.role === "user" ? "You" : "Assistant"}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label title="Time" text={formatDateTime(message.createdAt)} />
                      <List.Item.Detail.Metadata.Label title="Messages" text={String(messages.length)} />
                      <List.Item.Detail.Metadata.Label
                        title="Thinking"
                        text={settings.thinkingEnabled ? "Enabled" : "Disabled"}
                      />
                    </List.Item.Detail.Metadata>
                  ) : null
                }
              />
            }
            actions={renderActions(message)}
          />
        );
      })}
    </List>
  );
}

function AskForm({ onSubmit }: { onSubmit: (prompt: string) => Promise<void> }) {
  const { pop } = useNavigation();
  const [prompt, setPrompt] = useState("");

  async function handleSubmit(values: AskFormValues) {
    const text = values.prompt.trim();
    pop();
    await onSubmit(text);
  }

  return (
    <Form
      navigationTitle="Ask AI"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send" icon={Icon.Message} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder="Ask anything..."
        value={prompt}
        onChange={setPrompt}
        enableMarkdown
        autoFocus
      />
    </Form>
  );
}

function createMessage(role: ChatMessage["role"], content: string, settings: Settings): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    provider: settings.provider,
    model: getEffectiveModel(settings),
  };
}

function formatMessageDetail(message: ChatMessage, isGenerating: boolean): string {
  const parts = [message.content || (isGenerating ? "_Generating..._" : "_No content._")];

  if (message.reasoning) {
    parts.push("", "---", "", "**Reasoning**", "", message.reasoning);
  }

  if (message.error) {
    parts.push("", `> Error: ${message.error}`);
  }

  return parts.join("\n");
}

function previewText(message: ChatMessage): string {
  if (message.error) {
    return `Error: ${message.error}`;
  }

  const text = message.content.trim() || "Generating...";
  return text.replace(/\s+/g, " ").slice(0, 90);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
