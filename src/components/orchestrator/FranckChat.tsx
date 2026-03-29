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
import { toast } from 'sonner';
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
  Zap,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Lock,
  Check,
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
  getAvailableWorkflows,
  getChainCapabilities,
} from '@/services/franck-agent';
import type {
  FranckConversation,
  ProviderType,
  WorkflowProgress,
  ChainProgress,
} from '@/services/franck-agent';
import {
  runRefinementLoop,
  formatRefinementSummary,
  type RefinementProgress,
} from '@/services/franck-autopilot';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolsUsed?: string[];
  /** Set when this message was produced by a workflow */
  workflowName?: string;
  /** Set when this message was produced by a chain */
  chainName?: string;
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
  'event readiness check',
  'auto seat',
  "Who hasn't RSVP'd?",
  'Any issues?',
  'Draft reminder emails',
];

/** Workflow-triggering quick actions shown alongside regular ones */
const WORKFLOW_ACTIONS = [
  { label: 'Full Seating Setup', trigger: 'full seating setup', icon: '\uD83D\uDD17' },
  { label: 'Quick Optimization', trigger: 'quick optimization', icon: '\u26A1' },
  { label: 'Readiness Check', trigger: 'event readiness check', icon: '\u2705' },
  { label: 'Guest List Audit', trigger: 'guest list audit', icon: '\uD83D\uDCCB' },
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

  // Derive the actively locked model label for the header
  const activeModelLabel = (() => {
    try {
      const config = getProviderConfig();
      const provider = PROVIDERS[config.provider];
      const model = provider.models.find((m) => m.id === config.model);
      return model?.label ?? config.model.split('/').pop() ?? 'Unknown';
    } catch {
      return DEFAULT_FREE_CONFIG ? 'Step 1.5 Flash (Free)' : 'Not configured';
    }
  })();

  // Model change feedback state
  const [modelJustChanged, setModelJustChanged] = useState(false);

  // Auto-Pilot refinement state
  const [isRefining, setIsRefining] = useState(false);
  const [refinementProgress, setRefinementProgress] = useState<RefinementProgress | null>(null);

  // Workflow/chain progress state
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowProgress | null>(null);
  const [chainProgress, setChainProgress] = useState<ChainProgress | null>(null);

  // Capabilities panel state
  const [showCapabilities, setShowCapabilities] = useState(false);

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
    // ScrollArea renders a [data-radix-scroll-area-viewport] that is the
    // actual scrollable element. scrollRef sits inside it, so we walk up.
    const viewport = scrollRef.current?.closest('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isLoading]);

  // ── Scroll to bottom when chat opens ────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        const viewport = scrollRef.current?.closest('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      });
    }
  }, [isOpen]);

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

        // Reset progress indicators
        setWorkflowProgress(null);
        setChainProgress(null);

        const result = await sendMessage(
          conv,
          content,
          eventId,
          undefined, // onToolExecution
          (progress) => setWorkflowProgress(progress),
          (progress) => setChainProgress(progress),
        );
        setConversation(result.conversation);

        // Clear progress after completion
        setWorkflowProgress(null);
        setChainProgress(null);

        // If the response is empty and no tools were called, provide a fallback
        const responseContent = (!result.response || !result.response.trim()) && result.toolCalls.length === 0
          ? "Pardonnez-moi! Franck couldn't quite understand that request. Try one of these workflow actions that work instantly:\n\n- **\"event readiness check\"** — full event status report\n- **\"auto seat\"** — seat all unassigned guests\n- **\"guest list audit\"** — review the guest list\n- **\"quick optimization\"** — optimize current seating\n\nOr ask a specific question about your event!"
          : result.response;

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: responseContent,
          timestamp: Date.now(),
          toolsUsed: result.toolCalls.length > 0
            ? result.toolCalls.map((tc) => tc.name)
            : undefined,
          workflowName: result.workflowName,
          chainName: result.chainName,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        console.error('Franck error:', err);
        const errMessage = err instanceof Error ? err.message : String(err);
        let displayMessage: string;
        if (errMessage.includes('No LLM provider configured') || errMessage.includes('no provider')) {
          displayMessage = 'Mon dieu! Franck needs an API key to answer freeform questions. Please add one in the settings panel, or try a workflow action like "event readiness check" or "auto seat" which work without a key.';
        } else if (errMessage.includes('API') || errMessage.includes('401') || errMessage.includes('403') || errMessage.includes('rate')) {
          displayMessage = `Quelle horreur! The API returned an error: ${errMessage}`;
        } else {
          displayMessage = `Mon dieu! Something went wrong: ${errMessage}. Try a workflow action like "event readiness check" or "auto seat" — those don't require an API call.`;
        }
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: displayMessage,
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
    try {
      const existing = getProviderConfig();
      if (existing && existing.provider === provider) {
        saveProviderConfig({ ...existing, model: PROVIDERS[provider].defaultModel });
      }
    } catch { /* no config yet */ }
  };

  const handleModelChange = (model: string) => {
    const modelDef = PROVIDERS[selectedProvider].models.find((m) => m.id === model);
    const isFree = modelDef?.label.toLowerCase().includes('free') ?? false;

    // If user doesn't have an API key and model isn't free, warn them
    if (!isFree && !hasCustomProviderConfig() && !DEFAULT_FREE_CONFIG) {
      toast.error('API key required', {
        description: `Add a ${PROVIDERS[selectedProvider].label} API key to use ${modelDef?.label ?? model}.`,
      });
      return;
    }

    setSelectedModel(model);

    // Save the config — either update existing or create new with free key
    try {
      const existing = getProviderConfig();
      if (existing) {
        saveProviderConfig({ ...existing, provider: selectedProvider, model });
      }
    } catch {
      // No config yet — if it's a free model with DEFAULT_FREE_CONFIG, save that
      if (DEFAULT_FREE_CONFIG) {
        saveProviderConfig({ ...DEFAULT_FREE_CONFIG, model });
      }
    }
    setKeyStored(hasProviderConfig());

    // Flash feedback
    setModelJustChanged(true);
    setTimeout(() => setModelJustChanged(false), 2000);
    toast.success('Model locked in', {
      description: `Franck is now using ${modelDef?.label ?? model}`,
      duration: 2500,
    });
  };

  // ── Clear chat history ─────────────────────────────────────────────────
  const handleClearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setConversation(null);
    localStorage.removeItem(`${STORAGE_PREFIX}-msgs-${eventId}`);
    localStorage.removeItem(`${STORAGE_PREFIX}-conv-${eventId}`);
  };

  // ── Auto-Pilot refinement handler ───────────────────────────────────
  const handleAutoPilot = useCallback(async () => {
    if (isRefining || isLoading) return;

    setIsRefining(true);
    setRefinementProgress(null);

    // Add a user-style message to show the action was triggered
    const triggerMsg: ChatMessage = {
      id: `user-autopilot-${Date.now()}`,
      role: 'user',
      content: 'Refine my seating arrangement (Auto-Pilot)',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, triggerMsg]);

    try {
      const result = await runRefinementLoop(eventId, 20, (progress) => {
        setRefinementProgress(progress);
      });

      const summary = formatRefinementSummary(result);
      const resultMsg: ChatMessage = {
        id: `assistant-autopilot-${Date.now()}`,
        role: 'assistant',
        content: summary,
        timestamp: Date.now(),
        toolsUsed: ['run_refinement_loop'],
      };
      setMessages((prev) => [...prev, resultMsg]);
    } catch (err) {
      console.error('Auto-Pilot error:', err);
      const errorMsg: ChatMessage = {
        id: `error-autopilot-${Date.now()}`,
        role: 'assistant',
        content:
          'Quelle catastrophe! The Auto-Pilot encountered an error. Make sure guests are seated and tables exist, then try again.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsRefining(false);
      setRefinementProgress(null);
    }
  }, [isRefining, isLoading, eventId]);

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
          {/* Workflow/Chain badge above the message */}
          {!isUser && msg.workflowName && (
            <div className="mb-1 ml-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 border border-violet-500/30 px-2.5 py-0.5 text-[10px] font-medium text-violet-400">
                {'\uD83D\uDD17'} {msg.workflowName}
              </span>
            </div>
          )}
          {!isUser && msg.chainName && !msg.workflowName && (
            <div className="mb-1 ml-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-medium text-blue-400">
                {'\u26D3'} {msg.chainName}
              </span>
            </div>
          )}

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
              <p className={cn(
                'text-xs mt-0.5 flex items-center gap-1.5 transition-all duration-300',
                modelJustChanged
                  ? 'text-emerald-400'
                  : 'text-muted-foreground',
              )}>
                <Lock className={cn(
                  'h-2.5 w-2.5 transition-colors duration-300',
                  modelJustChanged ? 'text-emerald-400' : 'text-emerald-500/70',
                )} />
                <span className={cn(
                  'font-medium transition-colors duration-300',
                  modelJustChanged ? 'text-emerald-300' : 'text-emerald-500/90',
                )}>
                  {modelJustChanged ? 'Locked! ' : ''}{activeModelLabel}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Auto-Pilot button */}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 gap-1.5 text-xs font-medium',
                isRefining
                  ? 'text-violet-400 animate-pulse'
                  : 'text-muted-foreground hover:text-violet-400',
              )}
              onClick={handleAutoPilot}
              disabled={isRefining || isLoading}
              title="Auto-Pilot: algorithmically refine seating"
            >
              <Zap className="h-3.5 w-3.5" />
              {isRefining ? 'Refining...' : 'Auto-Pilot'}
            </Button>

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
                className="w-[340px]"
              >
                <div className="space-y-4">
                  {/* Active model indicator */}
                  <div className={cn(
                    'rounded-lg px-3 py-2.5 flex items-center gap-2.5 transition-all duration-300',
                    modelJustChanged
                      ? 'bg-emerald-500/20 border border-emerald-400/40'
                      : 'bg-emerald-500/10 border border-emerald-500/20',
                  )}>
                    <Lock className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
                      modelJustChanged ? 'text-emerald-400' : 'text-emerald-500',
                    )} />
                    <div className="min-w-0">
                      <p className={cn(
                        'text-[11px] font-semibold truncate transition-colors duration-300',
                        modelJustChanged ? 'text-emerald-300' : 'text-emerald-400',
                      )}>
                        {modelJustChanged ? 'Locked!' : 'Active:'} {activeModelLabel}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {modelJustChanged
                          ? 'Model updated successfully'
                          : usingFreeDefault
                            ? 'Free tier · upgrade with your own API key'
                            : 'Locked and ready'}
                      </p>
                    </div>
                  </div>

                  {/* Provider tabs */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Provider</label>
                    <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/50">
                      {(Object.keys(PROVIDERS) as ProviderType[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => handleProviderChange(p)}
                          className={cn(
                            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
                            selectedProvider === p
                              ? 'bg-violet-600 text-white shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          )}
                        >
                          {PROVIDERS[p].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Model selector — radio-style list with lock feedback */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Model <span className="normal-case font-normal">(click to lock in)</span>
                    </label>
                    <div className="rounded-lg border border-border/50 overflow-hidden divide-y divide-border/30 max-h-[200px] overflow-y-auto">
                      {PROVIDERS[selectedProvider].models.map((m) => {
                        const isActive = selectedModel === m.id;
                        const isFree = m.label.toLowerCase().includes('free');
                        const needsKey = !isFree && !hasCustomProviderConfig();
                        return (
                          <button
                            key={m.id}
                            onClick={() => handleModelChange(m.id)}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-200',
                              isActive
                                ? 'bg-violet-500/15 border-l-2 border-l-violet-500'
                                : 'hover:bg-muted/40 border-l-2 border-l-transparent',
                            )}
                          >
                            <div className={cn(
                              'shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200',
                              isActive
                                ? 'border-emerald-500 bg-emerald-500 scale-110'
                                : 'border-muted-foreground/40'
                            )}>
                              {isActive && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <span className={cn(
                              'text-xs font-medium flex-1',
                              isActive ? 'text-foreground' : 'text-muted-foreground'
                            )}>
                              {m.label}
                            </span>
                            {isFree && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 uppercase tracking-wide">
                                Free
                              </span>
                            )}
                            {needsKey && !isFree && (
                              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500/80 uppercase tracking-wide">
                                Key
                              </span>
                            )}
                            {isActive && (
                              <Lock className="h-3 w-3 text-emerald-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* API Key */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">API Key</label>
                      {keyStored && getProviderConfig()?.provider === selectedProvider && (
                        <span className="ml-auto flex items-center gap-1 text-emerald-500 text-[10px] font-medium">
                          <Check className="h-3 w-3" /> Saved
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

            {/* Workflow step progress indicator */}
            {workflowProgress && (
              <div className="flex gap-2 mb-4 justify-start">
                <Badge className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-violet-600 text-white text-xs border-0">
                  F
                </Badge>
                <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                    <span className="font-medium text-foreground">
                      {'\uD83D\uDD17'} {workflowProgress.workflowName}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {workflowProgress.steps.map((step, idx) => (
                      <div key={step.id} className="flex items-center gap-2 text-xs">
                        {step.status === 'pending' && (
                          <Circle className="h-3 w-3 text-muted-foreground/50" />
                        )}
                        {step.status === 'running' && (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                        )}
                        {step.status === 'completed' && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                        {step.status === 'failed' && (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className={cn(
                          step.status === 'completed' && 'text-emerald-500',
                          step.status === 'failed' && 'text-red-500',
                          step.status === 'running' && 'text-blue-400 font-medium',
                          step.status === 'pending' && 'text-muted-foreground/50',
                        )}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(workflowProgress.currentStep / workflowProgress.totalSteps) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Chain step progress indicator */}
            {chainProgress && chainProgress.phase !== 'done' && (
              <div className="flex gap-2 mb-4 justify-start">
                <Badge className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-violet-600 text-white text-xs border-0">
                  F
                </Badge>
                <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    <span className="font-medium text-foreground">
                      {'\u26D3'} Chain Execution
                    </span>
                  </div>
                  <div className="space-y-1">
                    {chainProgress.steps.map((step) => (
                      <div key={step.id} className="flex items-center gap-2 text-xs">
                        {step.status === 'pending' && (
                          <Circle className="h-3 w-3 text-muted-foreground/50" />
                        )}
                        {step.status === 'running' && (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                        )}
                        {step.status === 'completed' && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                        {step.status === 'failed' && (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className={cn(
                          step.status === 'completed' && 'text-emerald-500',
                          step.status === 'failed' && 'text-red-500',
                          step.status === 'running' && 'text-blue-400 font-medium',
                          step.status === 'pending' && 'text-muted-foreground/50',
                        )}>
                          {step.description}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(chainProgress.currentStep / chainProgress.totalSteps) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Auto-Pilot refinement progress */}
            {isRefining && (
              <div className="flex gap-2 mb-4 justify-start">
                <Badge className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-violet-600 text-white text-xs border-0">
                  F
                </Badge>
                <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-violet-400 animate-pulse" />
                    <span className="font-medium text-foreground">Auto-Pilot Active</span>
                  </div>
                  {refinementProgress && (
                    <>
                      <div className="text-xs">
                        Iteration {refinementProgress.iteration}/{refinementProgress.maxIterations}
                        {' '}&middot;{' '}Score: {refinementProgress.currentScore}/100
                      </div>
                      {refinementProgress.lastSwap && (
                        <div className="text-[11px] text-muted-foreground">
                          Last swap: {refinementProgress.lastSwap}
                        </div>
                      )}
                      <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                        <div
                          className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${(refinementProgress.iteration / refinementProgress.maxIterations) * 100}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Capabilities Panel (collapsible) ────────────────────────── */}
        {showCapabilities && (
          <div className="px-4 pb-2">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-violet-400" />
                  What can Franck do?
                </h3>
                <button
                  onClick={() => setShowCapabilities(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Workflows */}
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Workflows (instant, no LLM)
                </p>
                <div className="space-y-1.5">
                  {getAvailableWorkflows().map((w) => (
                    <button
                      key={w.id}
                      onClick={() => { setShowCapabilities(false); handleSend(w.triggerPhrases[0]); }}
                      disabled={isLoading || (!keyStored && !DEFAULT_FREE_CONFIG)}
                      className="w-full text-left rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5 hover:bg-muted/60 transition-colors disabled:opacity-40"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{w.icon}</span>
                        <span className="text-xs font-medium text-foreground">{w.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{w.description}</p>
                      <p className="text-[10px] text-violet-400 mt-0.5">
                        Try: &quot;{w.triggerPhrases[0]}&quot;
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chains */}
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Chain Patterns (multi-step, no LLM)
                </p>
                <div className="space-y-1">
                  {getChainCapabilities().map((c, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5"
                    >
                      <span className="text-xs font-medium text-foreground">{c.description}</span>
                      <p className="text-[10px] text-blue-400 mt-0.5">
                        Try: &quot;{c.triggerExample}&quot;
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Plus any freeform question via LLM chat!
              </p>
            </div>
          </div>
        )}

        {/* ── Quick Action Chips ──────────────────────────────────────── */}
        <div className="px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {/* Capabilities toggle */}
            <button
              onClick={() => setShowCapabilities((v) => !v)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
                'border border-violet-500/40 bg-violet-500/10',
                'text-violet-400 hover:text-violet-300',
                'hover:bg-violet-500/20 transition-colors',
              )}
            >
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {showCapabilities ? 'Hide' : 'Capabilities'}
              </span>
            </button>

            {/* Workflow action chips */}
            {WORKFLOW_ACTIONS.map((wa) => (
              <button
                key={wa.trigger}
                onClick={() => handleSend(wa.trigger)}
                disabled={isLoading || (!keyStored && !DEFAULT_FREE_CONFIG)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
                  'border border-violet-500/30 bg-violet-500/5',
                  'text-violet-400 hover:text-violet-300',
                  'hover:bg-violet-500/15 transition-colors',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                <span className="flex items-center gap-1">
                  <span>{wa.icon}</span>
                  {wa.label}
                </span>
              </button>
            ))}

            {/* Regular quick actions */}
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
