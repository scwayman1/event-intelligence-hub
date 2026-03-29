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
// Provider Registry
// ──────────────────────────────────────────────

export const PROVIDERS: Record<ProviderType, ProviderDefinition> = {
  anthropic: {
    name: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
    ],
  },
  openrouter: {
    name: 'openrouter',
    label: 'OpenRouter',
    keyPlaceholder: 'sk-or-v1-...',
    defaultModel: 'anthropic/claude-sonnet-4',
    models: [
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
      { id: 'anthropic/claude-haiku-4', label: 'Claude Haiku 4' },
      { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro' },
      { id: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
      { id: 'stepfun/step-1.5-flash:free', label: 'Step 1.5 Flash (Free)' },
      { id: 'nvidia/llama-3.3-nemotron-super-49b-v1:free', label: 'Nemotron Super 49B (Free)' },
      { id: 'openai/gpt-4.1', label: 'GPT-4.1' },
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
      { id: 'deepseek/deepseek-chat-v3', label: 'DeepSeek V3' },
      { id: 'mistralai/mistral-large-2', label: 'Mistral Large 2' },
    ],
  },
};

// ──────────────────────────────────────────────
// Default Free Model (works out of the box)
// ──────────────────────────────────────────────

const FREE_OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_FREE_KEY as string | undefined;
const FREE_MODEL = 'stepfun/step-1.5-flash:free';

export const DEFAULT_FREE_CONFIG: ProviderConfig | null = FREE_OPENROUTER_KEY
  ? { provider: 'openrouter', apiKey: FREE_OPENROUTER_KEY, model: FREE_MODEL }
  : null;

// ──────────────────────────────────────────────
// Config Persistence
// ──────────────────────────────────────────────

const CONFIG_KEY = 'franck-provider-config';
const LEGACY_KEY = 'franck-api-key';

export function getProviderConfig(): ProviderConfig {
  // 1. Check for user-saved config
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

  // 3. Fall back to built-in free model
  if (DEFAULT_FREE_CONFIG) return DEFAULT_FREE_CONFIG;

  // 4. No config at all — should not happen in production
  throw new Error('No LLM provider configured.');
}

export function saveProviderConfig(config: ProviderConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Whether the user has explicitly configured their own key (not using free default) */
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
// API Callers
// ──────────────────────────────────────────────

async function callAnthropic(
  config: ProviderConfig,
  systemPrompt: string,
  tools: AnthropicTool[],
  rawMessages: AnthropicRawMessage[],
): Promise<NormalizedResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages: rawMessages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content: AnthropicContentBlock[] = data.content;
  const stopReason: string = data.stop_reason;

  const textBlocks = content.filter((b) => b.type === 'text');
  const toolUseBlocks = content.filter((b) => b.type === 'tool_use');

  return {
    textContent: textBlocks.map((b) => b.text!).join('\n\n'),
    toolCalls: toolUseBlocks.map((b) => ({
      id: b.id!,
      name: b.name!,
      input: b.input as Record<string, unknown>,
    })),
    stopReason: stopReason === 'tool_use' ? 'tool_use' : 'end_turn',
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
  const openAITools = anthropicToolsToOpenAI(tools);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Event Intelligence Hub - Franck Agent',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      tools: openAITools,
      messages: openAIMessages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('No response from OpenRouter');

  const msg = choice.message;
  const finishReason = choice.finish_reason;

  const textContent = msg.content || '';
  const toolCalls = (msg.tool_calls || []).map((tc: { id: string; function: { name: string; arguments: string } }) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

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

  return {
    textContent,
    toolCalls,
    stopReason: finishReason === 'tool_calls' || toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    rawAssistantMessage: {
      role: 'assistant',
      content: anthropicBlocks.length > 0 ? anthropicBlocks : textContent,
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
