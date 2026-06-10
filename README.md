# Raycast All AI

Raycast extension for chatting with OpenAI-compatible AI providers.

## Providers

- Custom OpenAI-compatible API
- Xiaomi MiMo Pay-as-you-go API
- Xiaomi MiMo Token Plan
- DeepSeek API

## Features

- Configure a custom base URL, API key, auth header style, and model.
- Fetch models from the provider's `/models` endpoint.
- Test a provider with a small `/chat/completions` request before saving.
- Chat from Raycast with streaming responses and local conversation history.

## Development

```bash
npm install
npm run dev
```

Use the `Configure Provider` command first. After entering an API key, the extension tries to fetch available models from the provider's `/models` endpoint and stores the chosen model locally.

For `Custom OpenAI-compatible API`, enter a base URL such as `https://api.example.com/v1`, choose the auth header style, and optionally enter a model manually if the provider does not expose `/models`.

Use `Test Connection` in the configuration screen to send a small `/chat/completions` request with the current form values before saving.
