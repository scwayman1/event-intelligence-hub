import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Sparkles,
  X,
  Send,
  Settings,
  WandSparkles,
  ChevronRight,
  Loader2,
  KeyRound,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  sendMessage,
  createConversation,
  hasProviderConfig,
  hasCustomProviderConfig,
  saveProviderConfig,
  getProviderConfig,
  DEFAULT_FREE_CONFIG,
  PROVIDERS,
} from '@/services/franck-agent';
import type { FranckConversation, ProviderType } from '@/services/franck-agent';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolsUsed?: string[];
}

interface FranckChatProps {
  eventId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Franck is studying the guest list...',
  'Franck is contemplating the seating arrangement...',
  'Mon dieu, Franck is having a vision...',
  'Franck is consulting his impeccable taste...',
];

const QUICK_ACTIONS = [
  "How's my event looking?",
  'Auto-seat all guests',
  "Who hasn't RSVP'd?",
  'Any issues?',
  'Draft reminder emails',
];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Bonjour! I am Franck Eggelhoffer, and I am HERE to make your event absolutely MAGNIFIQUE! 🎩✨ Ask me anything about your guests, seating, or I can take care of things for you. Franck lives to serve the art of the perfect event!',
  timestamp: Date.now(),
};

// ─── Persistence helpers ──────────────────────────────────────────────────

const STORAGE_PREFIX = 'franck-chat';

function loadMessages(eventId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}-msgs-${eventId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (parsed.length > 0) return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return [WELCOME_MESSAGE];
}

function saveMessages(eventId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}-msgs-${eventId}`, JSON.stringify(messages));
  } catch { /* quota exceeded — silently drop */ }
}

function loadConversation(eventId: string): FranckConversation | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}-conv-${eventId}`);
    if (raw) return JSON.parse(raw) as FranckConversation;
  } catch { /* ignore */ }
  return null;
}

function saveConversation(eventId: string, conv: FranckConversation) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}-conv-${eventId}`, JSON.stringify(conv));
  } catch { /* quota exceeded */ }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FranckChat({ eventId }: FranckChatProps) {
  // State — initialized from localStorage
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<FranckConversation | null>(
    () => loadConversation(eventId)
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => loadMessages(eventId)
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(() => {
    try { return getProviderConfig().provider; } catch { return 'anthropic'; }
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    try { return getProviderConfig().model; } catch { return PROVIDERS.anthropic.defaultModel; }
  });
  const [keyStored, setKeyStored] = useState(() => hasProviderConfig());
  const usingFreeDefault = !hasCustomProviderConfig() && !!DEFAULT_FREE_CONFIG;

  // Persist messages whenever they change
  useEffect(() => {
    saveMessages(eventId, messages);
  }, [eventId, messages]);

  // Persist conversation whenever it changes
  useEffect(() => {
    if (conversation) {
      saveConversation(eventId, conversation);
    }
  }, [eventId, conversation]);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const loadingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-scroll on new messages ─────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ── Rotate loading messages ─────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) {
      loadingInterval.current = setInterval(() => {
        setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
      }, 2500);
    } else {
      if (loadingInterval.current) clearInterval(loadingInterval.current);
    }
    return () => {
      if (loadingInterval.current) clearInterval(loadingInterval.current);
    };
  }, [isLoading]);

  // ── Send handler ────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      const canSend = keyStored || !!DEFAULT_FREE_CONFIG;
      if (!content || isLoading || !canSend) return;

      // Create user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setLoadingMsgIndex(0);

      try {
        // Ensure we have a conversation
        let conv = conversation;
        if (!conv) {
          conv = createConversation(eventId);
          setConversation(conv);
        }

        const result = await sendMessage(conv, content, eventId);
        setConversation(result.conversation);

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.response,
          timestamp: Date.now(),
          toolsUsed: result.toolCalls.length > 0
            ? result.toolCalls.map((tc) => tc.name)
            : undefined,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        console.error('Franck error:', err);
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            'Mon dieu! Something went wrong. Please check your API key and try again.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, keyStored, conversation, eventId]
  );

  // ── Key handler for textarea ────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Auto-resize textarea ────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };

  // ── Save provider config ────────────────────────────────────────────────
  const handleSaveKey = () => {
    if (apiKeyInput.trim()) {
      saveProviderConfig({
        provider: selectedProvider,
        apiKey: apiKeyInput.trim(),
        model: selectedModel,
      });
      setKeyStored(true);
      setApiKeyInput('');
    }
  };

  const handleProviderChange = (provider: ProviderType) => {
    setSelectedProvider(provider);
    setSelectedModel(PROVIDERS[provider].defaultModel);
    // If we already have a config saved, update provider/model but keep existing key only if same provider
    const existing = getProviderConfig();
    if (existing && existing.provider === provider) {
      saveProviderConfig({ ...existing, model: PROVIDERS[provider].defaultModel });
    }
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    const existing = getProviderConfig();
    if (existing && existing.provider === selectedProvider) {
      saveProviderConfig({ ...existing, model });
    }
  };

  // ── Clear chat history ─────────────────────────────────────────────────
  const handleClearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setConversation(null);
    localStorage.removeItem(`${STORAGE_PREFIX}-msgs-${eventId}`);
    localStorage.removeItem(`${STORAGE_PREFIX}-conv-${eventId}`);
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === 'user';

    return (
      <div
        key={msg.id}
        className={cn('flex gap-2 mb-4', isUser ? 'justify-end' : 'justify-start')}
      >
        {/* Franck avatar */}
        {!isUser && (
          <Badge className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-violet-600 text-white text-xs border-0">
            F
          </Badge>
        )}

        <div className="flex flex-col max-w-[80%]">
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
              isUser
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-br-md'
                : 'bg-muted/60 text-foreground rounded-bl-md'
            )}
          >
            {msg.content}
          </div>

          {/* Tool usage indicator */}
          {msg.toolsUsed && msg.toolsUsed.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1 ml-1">
              {'🔧'} Used: {msg.toolsUsed.join(', ')}
            </p>
          )}
        </div>
      </div>
    );
  };

  // ─── FAB ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            'fixed bottom-6 right-6 z-50',
            'flex items-center gap-2 px-5 py-3 rounded-full',
            'bg-gradient-to-r from-violet-600 to-fuchsia-600',
            'text-white font-medium text-sm shadow-2xl',
            'backdrop-blur-sm border border-white/20',
            'hover:shadow-violet-500/30 hover:scale-105',
            'transition-all duration-300',
            'animate-pulse hover:animate-none'
          )}
        >
          <WandSparkles className="h-5 w-5" />
          Ask Franck
        </button>
      )}

      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-[420px] max-w-full',
          'flex flex-col',
          'bg-background/80 backdrop-blur-xl border-l border-border/50',
          'shadow-2xl shadow-black/20',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-none">
                Franck Eggelhoffer 🎩
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your Event Planning Genius
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Clear chat */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClearChat}
              title="Clear chat history"
            >
              <Trash2 className="h-4 w-4" />
            </Button>

            {/* API key settings popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80"
              >
                <div className="space-y-4">
                  {/* Provider selector */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Provider</label>
                    <div className="flex gap-1.5">
                      {(Object.keys(PROVIDERS) as ProviderType[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => handleProviderChange(p)}
                          className={cn(
                            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors',
                            selectedProvider === p
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/70'
                          )}
                        >
                          {PROVIDERS[p].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Model selector */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Model</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {PROVIDERS[selectedProvider].models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* API Key */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      <label className="text-xs font-medium text-muted-foreground">API Key</label>
                      {keyStored && getProviderConfig()?.provider === selectedProvider && (
                        <span className="ml-auto text-emerald-500 text-[10px] font-medium">
                          ✓ Saved
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={
                        keyStored && getProviderConfig()?.provider === selectedProvider
                          ? 'Key saved (enter new to replace)'
                          : PROVIDERS[selectedProvider].keyPlaceholder
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={handleSaveKey}
                    disabled={!apiKeyInput.trim()}
                    className="w-full"
                  >
                    Save Configuration
                  </Button>

                  {usingFreeDefault && (
                    <div className="rounded-md bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                      <p className="text-[11px] text-violet-400 font-medium">
                        Currently using free Step 1.5 Flash model
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Upgrade to Claude, GPT-4.1, Gemini &amp; more with one key.
                      </p>
                    </div>
                  )}

                  {/* OpenRouter onboarding */}
                  {selectedProvider === 'openrouter' && (
                    <div className="space-y-2">
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'flex items-center justify-center gap-2 w-full rounded-md px-3 py-2 text-xs font-medium',
                          'bg-gradient-to-r from-emerald-600 to-teal-600 text-white',
                          'hover:from-emerald-700 hover:to-teal-700 transition-all'
                        )}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Get a free OpenRouter key
                      </a>
                      <p className="text-[10px] text-muted-foreground leading-relaxed text-center">
                        One key, 100+ models, pay only for what you use.
                      </p>
                    </div>
                  )}

                  {selectedProvider === 'anthropic' && (
                    <div className="space-y-2">
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'flex items-center justify-center gap-2 w-full rounded-md px-3 py-2 text-xs font-medium',
                          'border border-border bg-muted/40 text-muted-foreground',
                          'hover:bg-muted/70 transition-colors'
                        )}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Get an Anthropic API key
                      </a>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Messages Area ──────────────────────────────────────────── */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div ref={scrollRef} className="space-y-1">
            {messages.map(renderMessage)}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2 mb-4 justify-start">
                <Badge className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-violet-600 text-white text-xs border-0">
                  F
                </Badge>
                <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="italic">
                      {LOADING_MESSAGES[loadingMsgIndex]}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Quick Action Chips ──────────────────────────────────────── */}
        <div className="px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => handleSend(action)}
                disabled={isLoading || (!keyStored && !DEFAULT_FREE_CONFIG)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
                  'border border-border/60 bg-muted/40',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-muted/70 transition-colors',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                <span className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  {action}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Input Area ──────────────────────────────────────────────── */}
        <div className="px-4 pb-4">
          {!keyStored && !DEFAULT_FREE_CONFIG && (
            <p className="text-xs text-amber-500 mb-2 text-center">
              Configure your LLM provider first (click the gear icon above)
            </p>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-muted/30 p-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                keyStored
                  ? 'Ask Franck anything about your event...'
                  : DEFAULT_FREE_CONFIG
                    ? 'Ask Franck anything about your event...'
                    : 'Configure provider first'
              }
              disabled={!keyStored || isLoading}
              rows={1}
              className={cn(
                'flex-1 resize-none bg-transparent text-sm',
                'placeholder:text-muted-foreground/60',
                'focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'max-h-[120px]'
              )}
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading || (!keyStored && !DEFAULT_FREE_CONFIG)}
              className={cn(
                'h-8 w-8 shrink-0 rounded-lg',
                'bg-gradient-to-r from-violet-600 to-fuchsia-600',
                'hover:from-violet-700 hover:to-fuchsia-700',
                'disabled:opacity-40'
              )}
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
