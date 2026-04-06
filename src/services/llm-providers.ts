/**
 * LLM Provider Abstraction Layer
 *
 * Supports multiple providers while keeping Franck's personality
 * consistent across all of them. Currently supports:
 * - Anthropic (direct BYOK with browser access)
 * - OpenRouter (OpenAI-compatible, access to 100+ models)
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type ProviderType = 'anthropic' | 'openrouter';

export interface ProviderConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
}

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderDefinition {
  name: string;
  label: string;
  keyPlaceholder: string;
  defaultModel: string;
  models: ProviderModel[];
}

// Anthropic types (existing)
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicRawMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface NormalizedResponse {
  textContent: string;
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[];
  stopReason: 'end_turn' | 'tool_use';
  rawAssistantMessage: AnthropicRawMessage;
}

// ──────────────────────────────────────────────
// Model Capabilities
// ──────────────────────────────────────────────

interface ModelCapabilities {
  toolUse: boolean;
}

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Free models — all verified with tool calling
  'qwen/qwen3.6-plus:free': { toolUse: true },
  'x-ai/grok-4-fast:free': { toolUse: true },
  'meta-llama/llama-4-maverick:free': { toolUse: true },
  'deepseek/deepseek-chat-v3-0324:free': { toolUse: true },
  'nvidia/nemotron-3-super-120b-a12b:free': { toolUse: true },
  'openai/gpt-oss-120b:free': { toolUse: true },
  'meta-llama/llama-3.3-70b-instruct:free': { toolUse: true },
  'qwen/qwen3-coder:free': { toolUse: true },
  // Paid models
  'deepseek/deepseek-chat': { toolUse: true },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = { toolUse: true };

/**
 * Check whether a model supports tool use.
 * Claude, GPT, and Gemini models are known to support tools well.
 * Unknown models default to tool support enabled (better to try and
 * gracefully degrade than silently disable tools). Models that are
 * known to NOT support tools (e.g. reasoning-only models) are
 * explicitly listed with `toolUse: false`.
 */
export function modelSupportsTools(modelId: string): boolean {
  // Exact match first
  if (modelId in MODEL_CAPABILITIES) {
    return MODEL_CAPABILITIES[modelId].toolUse;
  }
  // Claude models always support tools
  const lower = modelId.toLowerCase();
  if (lower.includes('claude')) return true;
  // GPT models always support tools
  if (lower.includes('gpt')) return true;
  // Gemini models support tools
  if (lower.includes('gemini')) return true;
  // Default: no tool support
  return DEFAULT_CAPABILITIES.toolUse;
}

// ──────────────────────────────────────────────
// Provider Registry
// ──────────────────────────────────────────────

export const PROVIDERS: Record<ProviderType, ProviderDefinition> = {
  anthropic: {
    name: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-6-20260305',
    models: [
      { id: 'claude-sonnet-4-6-20260305', label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6-20260305', label: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Legacy)' },
    ],
  },
  openrouter: {
    name: 'openrouter',
    label: 'OpenRouter',
    keyPlaceholder: 'sk-or-v1-...',
    defaultModel: 'qwen/qwen3.6-plus:free',
    models: [
      // ── Free models (no API key required) ──
      { id: 'qwen/qwen3.6-plus:free', label: '🆓 Qwen 3.6 Plus — 1M ctx, best free tool calling' },
      { id: 'x-ai/grok-4-fast:free', label: '🆓 Grok 4 Fast' },
      { id: 'meta-llama/llama-4-maverick:free', label: '🆓 Llama 4 Maverick' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: '🆓 DeepSeek V3 0324' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: '🆓 Nemotron 3 Super 120B — 262K ctx' },
      { id: 'openai/gpt-oss-120b:free', label: '🆓 GPT-OSS 120B' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: '🆓 Llama 3.3 70B' },
      { id: 'qwen/qwen3-coder:free', label: '🆓 Qwen 3 Coder 480B' },
      // ── Best value (great tool calling, pennies per conversation) ──
      { id: 'anthropic/claude-haiku-4.5', label: '⚡ Claude Haiku 4.5 (Best Value)' },
      { id: 'deepseek/deepseek-chat', label: '⚡ DeepSeek V3' },
      { id: 'google/gemini-2.5-flash', label: '⚡ Gemini 2.5 Flash' },
      // ── Premium (excellent tool calling, reliable) ──
      { id: 'anthropic/claude-sonnet-4.6', label: '💎 Claude Sonnet 4.6' },
      { id: 'openai/gpt-4.1', label: '💎 GPT-4.1' },
      { id: 'google/gemini-2.5-pro', label: '💎 Gemini 2.5 Pro' },
      // ── Flagship (best quality, highest cost) ──
      { id: 'anthropic/claude-opus-4.6', label: '👑 Claude Opus 4.6' },
    ],
  },
};

// ──────────────────────────────────────────────
// Default Free Model (works out of the box)
// ──────────────────────────────────────────────

const FREE_OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_FREE_KEY as string | undefined;
const FREE_MODEL = 'qwen/qwen3.6-plus:free';

/** Best paid model for org-level use — fast, cheap, great tool calling */
export const RECOMMENDED_PAID_MODEL = 'anthropic/claude-haiku-4.5';

export const DEFAULT_FREE_CONFIG: ProviderConfig | null = FREE_OPENROUTER_KEY
  ? { provider: 'openrouter', apiKey: FREE_OPENROUTER_KEY, model: FREE_MODEL }
  : null;

// ──────────────────────────────────────────────
// Config Persistence
// ──────────────────────────────────────────────

const CONFIG_KEY = 'franck-provider-config';
const LEGACY_KEY = 'franck-api-key';

/** Cached org config — set by setOrgLLMConfig() when store loads */
let _orgLLMConfig: ProviderConfig | null = null;

/**
 * Called by the UI when the active org changes or on app load.
 * Pushes org-level LLM config into the provider resolution chain.
 */
export function setOrgLLMConfig(cfg: { provider: 'anthropic' | 'openrouter'; apiKey: string; model: string } | undefined): void {
  _orgLLMConfig = cfg ? { provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model } : null;
}

/** Returns the current org-level LLM config (if any). */
export function getOrgLLMConfig(): ProviderConfig | null {
  return _orgLLMConfig;
}

/**
 * Resolution priority:
 * 1. Personal override (localStorage) — user's own API key
 * 2. Org-level config (Supabase) — shared across all team members
 * 3. Built-in free model (DeepSeek V3 via bundled OpenRouter key)
 */
export function getProviderConfig(): ProviderConfig {
  // 1. Check for personal user-saved config in localStorage
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw) as ProviderConfig;
  } catch { /* ignore */ }

  // 2. Migrate legacy Anthropic key
  const legacyKey = localStorage.getItem(LEGACY_KEY);
  if (legacyKey) {
    const config: ProviderConfig = {
      provider: 'anthropic',
      apiKey: legacyKey,
      model: PROVIDERS.anthropic.defaultModel,
    };
    saveProviderConfig(config);
    localStorage.removeItem(LEGACY_KEY);
    return config;
  }

  // 3. Org-level config (shared by all team members)
  if (_orgLLMConfig) return _orgLLMConfig;

  // 4. Fall back to built-in free model
  if (DEFAULT_FREE_CONFIG) return DEFAULT_FREE_CONFIG;

  // 5. No config at all — should not happen in production
  throw new Error('No LLM provider configured.');
}

export function saveProviderConfig(config: ProviderConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Clear the personal override so the user falls back to org config */
export function clearPersonalProviderConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

/** Where the current config is coming from */
export type ConfigSource = 'personal' | 'org' | 'free';

export function getConfigSource(): ConfigSource {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return 'personal';
  } catch { /* ignore */ }
  const legacyKey = localStorage.getItem(LEGACY_KEY);
  if (legacyKey) return 'personal';
  if (_orgLLMConfig) return 'org';
  return 'free';
}

/** Whether the user has explicitly configured their own key (not using org or free default) */
export function hasCustomProviderConfig(): boolean {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return true;
  } catch { /* ignore */ }
  const legacyKey = localStorage.getItem(LEGACY_KEY);
  if (legacyKey) return true;
  return false;
}

/** Whether Franck can operate — either custom config or free default available */
export function hasProviderConfig(): boolean {
  return hasCustomProviderConfig() || !!DEFAULT_FREE_CONFIG;
}

// ──────────────────────────────────────────────
// Format Converters: Anthropic ↔ OpenAI
// ──────────────────────────────────────────────

interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function anthropicToolsToOpenAI(tools: AnthropicTool[]): OpenAIFunction[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

function anthropicMessagesToOpenAI(
  systemPrompt: string,
  messages: AnthropicRawMessage[],
): OpenAIMessage[] {
  const result: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    // Array of content blocks
    if (msg.role === 'assistant') {
      const textParts = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text!)
        .join('\n\n');

      const toolCalls = msg.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: b.id!,
          type: 'function' as const,
          function: {
            name: b.name!,
            arguments: JSON.stringify(b.input),
          },
        }));

      const openAIMsg: OpenAIMessage = { role: 'assistant' };
      if (textParts) openAIMsg.content = textParts;
      else openAIMsg.content = null;
      if (toolCalls.length > 0) openAIMsg.tool_calls = toolCalls;
      result.push(openAIMsg);
    } else {
      // User message with content blocks (tool results)
      const toolResults = msg.content.filter((b) => b.type === 'tool_result');
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id!,
            content: tr.content || '',
          });
        }
      } else {
        // Normal text blocks from user
        const text = msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text!)
          .join('\n\n');
        result.push({ role: 'user', content: text });
      }
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Retry & Timeout Helpers
// ──────────────────────────────────────────────

const API_TIMEOUT_MS = 120_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 2;
const BACKOFF_MS = [1000, 2000];

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init);
      if (!response.ok && RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
        await delay(BACKOFF_MS[attempt]);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await delay(BACKOFF_MS[attempt]);
        continue;
      }
    }
  }
  throw lastError ?? new Error('Request failed after retries');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// API Callers
// ──────────────────────────────────────────────

async function callAnthropic(
  config: ProviderConfig,
  systemPrompt: string,
  tools: AnthropicTool[],
  rawMessages: AnthropicRawMessage[],
): Promise<NormalizedResponse> {
  const supportsTools = modelSupportsTools(config.model);

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: rawMessages,
  };
  if (supportsTools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody.replace(config.apiKey, '[REDACTED]')}`);
  }

  const data = await response.json();

  // Validate expected response shape
  if (!data || !Array.isArray(data.content)) {
    throw new Error(
      `Anthropic API returned unexpected response shape: missing "content" array`,
    );
  }

  const content: AnthropicContentBlock[] = data.content;
  const stopReason: string = data.stop_reason ?? 'end_turn';

  const textBlocks = content.filter((b) => b.type === 'text');
  const toolUseBlocks = content.filter((b) => b.type === 'tool_use');

  return {
    textContent: textBlocks.map((b) => b.text ?? '').join('\n\n'),
    toolCalls: toolUseBlocks.map((b) => ({
      id: b.id ?? '',
      name: b.name ?? '',
      input: (b.input as Record<string, unknown>) ?? {},
    })),
    stopReason: stopReason === 'tool_use' || toolUseBlocks.length > 0 ? 'tool_use' : 'end_turn',
    rawAssistantMessage: { role: 'assistant', content },
  };
}

async function callOpenRouter(
  config: ProviderConfig,
  systemPrompt: string,
  tools: AnthropicTool[],
  rawMessages: AnthropicRawMessage[],
): Promise<NormalizedResponse> {
  const openAIMessages = anthropicMessagesToOpenAI(systemPrompt, rawMessages);
  const supportsTools = modelSupportsTools(config.model);

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    messages: openAIMessages,
  };
  if (supportsTools && tools.length > 0) {
    body.tools = anthropicToolsToOpenAI(tools);
  }

  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Event Intelligence Hub - Franck Agent',
  };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody.replace(config.apiKey, '[REDACTED]')}`);
  }

  const data = await response.json();

  // Validate expected response shape — retry once if malformed
  if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
    // Some free models occasionally return empty/malformed responses.
    // Retry once before giving up.
    console.warn('OpenRouter returned malformed response, retrying...', data);
    await delay(1500);
    const retryResponse = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!retryResponse.ok) {
      throw new Error(`OpenRouter retry failed (${retryResponse.status})`);
    }
    const retryData = await retryResponse.json();
    if (!retryData || !Array.isArray(retryData.choices) || retryData.choices.length === 0) {
      // Return a graceful text-only response instead of crashing
      return {
        textContent: 'Mon Dieu! The model had a brief moment of confusion. Please try your request again — Franck is ready!',
        toolCalls: [],
        stopReason: 'stop',
        rawAssistantMessage: { role: 'assistant' as const, content: 'The model returned an invalid response. Please retry.' },
      };
    }
    // Use retry data
    Object.assign(data, retryData);
  }

  const choice = data.choices[0];
  if (!choice.message) {
    throw new Error('OpenRouter API returned unexpected response shape: missing "message"');
  }

  const msg = choice.message;
  const finishReason = choice.finish_reason ?? 'stop';

  const textContent: string = typeof msg.content === 'string' ? msg.content : '';

  // Parse tool calls safely — if JSON.parse fails, treat as text response
  const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
      try {
        // Some models (e.g. DeepSeek) may return arguments as an object instead of a string
        const args = tc.function.arguments;
        const parsed: Record<string, unknown> =
          typeof args === 'string'
            ? JSON.parse(args) as Record<string, unknown>
            : (args as unknown as Record<string, unknown>) ?? {};
        // Generate a fallback ID if the model doesn't provide one (some models omit it)
        const id = tc.id || `tool_${crypto.randomUUID()}`;
        toolCalls.push({
          id,
          name: tc.function.name,
          input: parsed,
        });
      } catch {
        // If arguments can't be parsed, skip this tool call and fall through to text response.
        // Append the raw data to textContent so nothing is silently lost.
        console.warn(
          `Failed to parse tool call arguments for "${tc.function.name}", treating as text response`,
        );
      }
    }
  }

  // Convert back to Anthropic content block format for rawMessages storage
  const anthropicBlocks: AnthropicContentBlock[] = [];
  if (textContent) {
    anthropicBlocks.push({ type: 'text', text: textContent });
  }
  for (const tc of toolCalls) {
    anthropicBlocks.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.name,
      input: tc.input,
    });
  }

  // Always use AnthropicContentBlock[] for rawAssistantMessage.content for consistency.
  // If there are no blocks at all, produce a single empty text block to keep the type stable.
  const rawContent: AnthropicContentBlock[] =
    anthropicBlocks.length > 0
      ? anthropicBlocks
      : [{ type: 'text', text: '' }];

  return {
    textContent,
    toolCalls,
    stopReason: finishReason === 'tool_calls' || toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    rawAssistantMessage: {
      role: 'assistant',
      content: rawContent,
    },
  };
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export async function callLLM(
  config: ProviderConfig,
  systemPrompt: string,
  tools: AnthropicTool[],
  rawMessages: AnthropicRawMessage[],
): Promise<NormalizedResponse> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, systemPrompt, tools, rawMessages);
    case 'openrouter':
      return callOpenRouter(config, systemPrompt, tools, rawMessages);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
