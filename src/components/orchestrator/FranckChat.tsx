import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  RotateCcw,
  ClipboardList,
  Users,
  MessageSquare,
  AlertCircle,
  Mail,
} from 'lucide-react';
import {
  sendMessage,
  createConversation,
  hasProviderConfig,
  hasCustomProviderConfig,
  saveProviderConfig,
  clearPersonalProviderConfig,
  getProviderConfig,
  getConfigSource,
  getOrgLLMConfig,
  DEFAULT_FREE_CONFIG,
  PROVIDERS,
  getAvailableWorkflows,
  getChainCapabilities,
} from '@/services/franck-agent';
import { useEventStore } from '@/data/store';
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
  { label: 'Event Status', trigger: 'event readiness check', Icon: ClipboardList },
  { label: 'Auto-Seat Guests', trigger: 'auto seat', Icon: Users },
  { label: "Missing RSVPs", trigger: "Who hasn't RSVP'd?", Icon: MessageSquare },
  { label: 'Find Issues', trigger: 'Any issues?', Icon: AlertCircle },
  { label: 'Draft Reminders', trigger: 'Draft reminder emails', Icon: Mail },
];

/** Workflow-triggering quick actions shown alongside regular ones */
const WORKFLOW_ACTIONS = [
  { label: 'Full Seating Setup', trigger: 'full seating setup', icon: '\uD83D\uDD17' },
  { label: 'Quick Optimization', trigger: 'quick optimization', icon: '\u26A1' },
  { label: 'Readiness Check', trigger: 'event readiness check', icon: '\u2705' },
  { label: 'Guest List Audit', trigger: 'guest list audit', icon: '\uD83D\uDCCB' },
];

// ─── Franck's Countdown Nudges ────────────────────────────────────────────
// Franck gets increasingly nervous as the event approaches.
// These fire once per session when the chat opens.

const NUDGE_COOLDOWN_KEY = 'franck-nudge-ts';

interface NudgeContext {
  daysUntil: number;
  eventName: string;
  totalGuests: number;
  confirmedGuests: number;
  seatedGuests: number;
  tableCount: number;
  confirmationPct: number;
  seatingPct: number;
}

function generateFranckNudge(ctx: NudgeContext): string | null {
  const { daysUntil, eventName, totalGuests, confirmedGuests, seatedGuests, tableCount, confirmationPct, seatingPct } = ctx;

  // Event already passed or too far out
  if (daysUntil < 0) return null;
  if (daysUntil > 90) return null;

  // Build urgency-appropriate messages
  if (daysUntil === 0) {
    if (seatingPct < 100) {
      return `MON DIEU! **${eventName} is TODAY** and ${totalGuests - seatedGuests} guests are still not seated! This is a CATASTROPHE! Let Franck fix this IMMEDIATELY — say "full seating setup"! 🚨🎩`;
    }
    return `Today is the day! **${eventName}** — Franck has prepared everything to PERFECTION. ${confirmedGuests} guests, ${tableCount} tables, all magnifique. Go make it beautiful! ✨🎩`;
  }

  if (daysUntil <= 3) {
    const parts: string[] = [`**${daysUntil} day${daysUntil === 1 ? '' : 's'}** until ${eventName}! Franck can barely BREATHE!`];
    if (seatingPct < 80) parts.push(`Only ${seatingPct}% of guests are seated — this is NOT acceptable! Say "full seating setup" and let Franck WORK!`);
    if (confirmationPct < 70) parts.push(`${100 - confirmationPct}% of guests have not confirmed! We need to chase these people DOWN!`);
    if (seatingPct >= 80 && confirmationPct >= 70) parts.push(`But the preparation... it is coming together. ${confirmedGuests} confirmed, ${seatedGuests} seated. Franck approves... mostly. 😤`);
    return parts.join(' ') + ' 🚨';
  }

  if (daysUntil <= 7) {
    const parts: string[] = [`**${daysUntil} days** until ${eventName}! Franck is getting NERVOUS!`];
    if (seatingPct < 50) parts.push(`Less than half the guests are seated — sacre bleu! We must do the seating NOW!`);
    else if (seatingPct < 90) parts.push(`${seatedGuests} of ${confirmedGuests} confirmed guests are seated. We are close but NOT there yet!`);
    if (confirmationPct < 60) parts.push(`And only ${confirmationPct}% confirmation rate?! We need reminder emails YESTERDAY!`);
    return parts.join(' ');
  }

  if (daysUntil <= 14) {
    if (seatingPct < 30) {
      return `**${daysUntil} days** out from ${eventName} and the seating chart is practically EMPTY! ${seatedGuests} of ${confirmedGuests} guests seated — Franck cannot work under these conditions! Let's get moving! 💺`;
    }
    if (confirmationPct < 50) {
      return `Two weeks until ${eventName} and only ${confirmationPct}% of guests have confirmed?! Franck needs ANSWERS from these people! Should I draft some reminder emails? 📧`;
    }
    if (tableCount === 0) {
      return `**${daysUntil} days** until ${eventName} and there are NO TABLES! Not a single one! How can Franck create a masterpiece with no canvas?! Go to Layout and add some tables! 🪑`;
    }
    return `**${daysUntil} days** until ${eventName}. ${confirmedGuests} confirmed, ${seatedGuests} seated across ${tableCount} tables. We are making progress, but Franck does not REST until it is PERFECT! 🎩`;
  }

  if (daysUntil <= 30) {
    if (totalGuests === 0) {
      return `**${daysUntil} days** until ${eventName} and the guest list is EMPTY! Zero! Franck cannot seat GHOSTS! We need to add guests first! 👻`;
    }
    if (confirmationPct < 30) {
      return `One month out from ${eventName} — ${totalGuests} guests invited but only ${confirmationPct}% confirmed. We should start sending those invitations, non? 📬`;
    }
    return null; // Don't be too annoying at 30 days if things are on track
  }

  if (daysUntil <= 60 && totalGuests === 0) {
    return `${eventName} is in **${daysUntil} days** and the guest list is empty. Franck is patient... for now. But we should start planning, oui? 🎩`;
  }

  return null; // Too far out, stay calm
}

/** Suggested follow-up actions shown after freeform LLM responses */
const CONTEXTUAL_SUGGESTIONS = [
  { label: 'Check event readiness', trigger: 'event readiness check' },
  { label: 'Review guest list', trigger: 'guest list audit' },
  { label: 'Auto-seat everyone', trigger: 'auto seat' },
  { label: 'Optimize seating', trigger: 'quick optimization' },
  { label: 'Find potential issues', trigger: 'Any issues?' },
];

/**
 * Simple markdown renderer for bold, italic, headers, and bullet points.
 * Content comes from our own system so dangerouslySetInnerHTML is acceptable.
 */
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers: ### header -> <strong style>header</strong>
    .replace(/^### (.+)$/gm, '<strong style="font-size:1.05em;display:block;margin:0.6em 0 0.25em">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:1.1em;display:block;margin:0.6em 0 0.25em">$1</strong>')
    .replace(/^# (.+)$/gm, '<strong style="font-size:1.15em;display:block;margin:0.6em 0 0.25em">$1</strong>')
    // Bold: **text** -> <strong>text</strong>
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* -> <em>text</em>
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')
    // Bullet points: - item -> styled list item
    .replace(/^- (.+)$/gm, '<span style="display:flex;gap:0.4em;margin:0.15em 0"><span style="opacity:0.5">&#x2022;</span><span>$1</span></span>')
    // Numbered lists: 1. item -> styled
    .replace(/^(\d+)\. (.+)$/gm, '<span style="display:flex;gap:0.4em;margin:0.15em 0"><span style="opacity:0.5">$1.</span><span>$2</span></span>');
  return html;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Bonjour! I am Franck Eggelhoffer, and I am HERE to make your event absolutely MAGNIFIQUE! 🎩✨\n\n' +
    'I\'m powered by **DeepSeek V3.1** via OpenRouter — completely free, no setup needed. ' +
    'Want even more power? Bring your own OpenRouter or Anthropic API key in Settings (gear icon above) to unlock premium models like Claude or GPT-4.\n\n' +
    'Ask me anything about your guests, seating, or I can take care of things for you!',
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
  // Real-time tool execution tracking for the LLM agentic loop
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [executedTools, setExecutedTools] = useState<string[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(() => {
    try { return getProviderConfig().provider; } catch { return 'anthropic'; }
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    try { return getProviderConfig().model; } catch { return PROVIDERS.anthropic.defaultModel; }
  });
  const [keyStored, setKeyStored] = useState(() => hasProviderConfig());
  const configSource = getConfigSource();
  const usingFreeDefault = configSource === 'free';
  const usingOrgKey = configSource === 'org';
  const [saveScope, setSaveScope] = useState<'org' | 'personal'>('org');
  const activeOrgId = useEventStore((s) => s.activeOrgId);
  const organizations = useEventStore((s) => s.organizations);
  const updateOrganization = useEventStore((s) => s.updateOrganization);

  // Event data for Franck's countdown nudges
  const events = useEventStore((s) => s.events);
  const allGuests = useEventStore((s) => s.guests);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const event = useMemo(() => events.find((e) => e.id === eventId), [events, eventId]);
  const nudgeRef = useRef(false);

  // Derive the actively locked model label for the header
  const activeModelLabel = (() => {
    try {
      const config = getProviderConfig();
      const provider = PROVIDERS[config.provider];
      const model = provider.models.find((m) => m.id === config.model);
      return model?.label ?? config.model.split('/').pop() ?? 'Unknown';
    } catch {
      return DEFAULT_FREE_CONFIG ? 'DeepSeek V3.1 (Free)' : 'Not configured';
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

  // Loading timer state — show "taking longer" message after 10s
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track last user message for retry
  const lastUserMessageRef = useRef<string>('');

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

  // ── Franck's countdown nudge — fires once per session when chat opens ──
  useEffect(() => {
    if (!isOpen || nudgeRef.current || !event?.date) return;

    // Only nudge once every 4 hours
    const cooldownKey = `${NUDGE_COOLDOWN_KEY}-${eventId}`;
    const lastNudge = localStorage.getItem(cooldownKey);
    if (lastNudge && Date.now() - Number(lastNudge) < 4 * 60 * 60 * 1000) return;

    const now = new Date().toISOString().split('T')[0];
    const daysUntil = Math.round(
      (new Date(event.date).getTime() - new Date(now).getTime()) / 86_400_000,
    );

    const eventGuests = allGuests.filter((g) => g.eventId === eventId);
    const confirmed = eventGuests.filter((g) =>
      g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in',
    );
    const versions = useEventStore.getState().versions.filter((v) => v.eventId === eventId);
    const versionId = versions.find((v) => v.id === event.activeVersionId)?.id ?? event.activeVersionId;
    const versionAssignments = seatingAssignments.filter((a) => a.versionId === versionId);
    const tables = layoutObjects.filter(
      (o) => (o.type === 'round_table' || o.type === 'rect_table') && o.versionId === versionId,
    );

    const ctx: NudgeContext = {
      daysUntil,
      eventName: event.name,
      totalGuests: eventGuests.length,
      confirmedGuests: confirmed.length,
      seatedGuests: versionAssignments.length,
      tableCount: tables.length,
      confirmationPct: eventGuests.length > 0 ? Math.round((confirmed.length / eventGuests.length) * 100) : 0,
      seatingPct: confirmed.length > 0 ? Math.round((versionAssignments.length / confirmed.length) * 100) : 0,
    };

    const nudge = generateFranckNudge(ctx);
    if (nudge) {
      nudgeRef.current = true;
      localStorage.setItem(cooldownKey, String(Date.now()));
      // Delay slightly so it feels like Franck is "noticing" the situation
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `nudge-${Date.now()}`,
            role: 'assistant',
            content: nudge,
            timestamp: Date.now(),
          },
        ]);
      }, 800);
    }
  }, [isOpen, event, eventId, allGuests, seatingAssignments, layoutObjects]);

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

  // ── Loading "too long" timer ────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) {
      setLoadingTooLong(false);
      loadingTimerRef.current = setTimeout(() => {
        setLoadingTooLong(true);
      }, 10_000);
    } else {
      setLoadingTooLong(false);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    }
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [isLoading]);

  // ── Escape key to close panel ──────────────────────────────────────────
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // ── Send handler ────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      const canSend = keyStored || !!DEFAULT_FREE_CONFIG;
      if (!content || isLoading || !canSend) return;

      // Track for retry
      lastUserMessageRef.current = content;

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
        setActiveToolName(null);
        setExecutedTools([]);

        const result = await sendMessage(
          conv,
          content,
          eventId,
          (toolName) => {
            setActiveToolName(toolName);
            setExecutedTools((prev) => [...prev, toolName]);
          },
          (progress) => setWorkflowProgress(progress),
          (progress) => setChainProgress(progress),
        );
        setConversation(result.conversation);

        // Clear progress after completion
        setWorkflowProgress(null);
        setChainProgress(null);
        setActiveToolName(null);

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

        // Auto-recovery: if conversation history might be corrupted, reset it
        // so the next message starts fresh
        if (
          errMessage.includes('messages: roles must alternate') ||
          errMessage.includes('tool_use_id') ||
          errMessage.includes('tool_result') ||
          errMessage.includes('unexpected response shape') ||
          errMessage.includes('content') && errMessage.includes('array')
        ) {
          console.warn('[Franck] Resetting conversation due to likely corrupted history');
          const freshConv = createConversation(eventId);
          setConversation(freshConv);
          displayMessage += '\n\n_Franck has reset the conversation to recover from a data issue. Please try again._';
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
        setActiveToolName(null);
        setExecutedTools([]);
      }
    },
    [input, isLoading, keyStored, conversation, eventId]
  );

  // ── Retry handler — re-sends the last user message ─────────────────────
  const handleRetry = useCallback(() => {
    if (lastUserMessageRef.current && !isLoading) {
      handleSend(lastUserMessageRef.current);
    }
  }, [handleSend, isLoading]);

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
    if (!apiKeyInput.trim()) return;
    const modelDef = PROVIDERS[selectedProvider].models.find((m) => m.id === selectedModel);

    if (saveScope === 'org' && activeOrgId) {
      // Save to org — shared by all team members
      const llmConfig = {
        provider: selectedProvider,
        apiKey: apiKeyInput.trim(),
        model: selectedModel,
      };
      // Also save as personal config so this device works immediately
      // even if the Supabase write fails or takes time
      saveProviderConfig({
        provider: selectedProvider,
        apiKey: apiKeyInput.trim(),
        model: selectedModel,
      });
      updateOrganization(activeOrgId, { llmConfig });
      setKeyStored(true);
      setApiKeyInput('');
      setModelJustChanged(true);
      setTimeout(() => setModelJustChanged(false), 2000);
      // Verify the Supabase write actually worked
      import('@/services/supabase-db').then(async ({ upsertOrganization: upsertOrg }) => {
        try {
          const fullOrg = useEventStore.getState().organizations.find((o) => o.id === activeOrgId);
          if (fullOrg) {
            await upsertOrg(fullOrg);
            console.log('[llm-config] Org LLM config saved to Supabase');
            // Now safe to clear personal override — org config is confirmed in DB
            clearPersonalProviderConfig();
            toast.success('Org API key saved!', {
              description: `All team members will now use ${modelDef?.label ?? selectedModel}. No setup needed for them!`,
              duration: 4000,
            });
          }
        } catch (err) {
          console.error('[llm-config] Failed to save org config to Supabase:', err);
          toast.error('Warning: saved locally but failed to sync to team', {
            description: 'Your key works on this device. Other devices may not see it until the sync issue is resolved.',
            duration: 6000,
          });
          // Keep personal config as fallback since Supabase write failed
        }
      });
    } else {
      // Save as personal override (localStorage only)
      saveProviderConfig({
        provider: selectedProvider,
        apiKey: apiKeyInput.trim(),
        model: selectedModel,
      });
      setKeyStored(true);
      setApiKeyInput('');
      setModelJustChanged(true);
      setTimeout(() => setModelJustChanged(false), 2000);
      toast.success('Personal API key saved!', {
        description: `Franck is now powered by ${modelDef?.label ?? selectedModel}.`,
        duration: 3000,
      });
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

        <div className="flex flex-col max-w-[80%] min-w-0 overflow-hidden">
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
              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words overflow-hidden',
              isUser
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-br-md whitespace-pre-wrap'
                : 'bg-muted/60 text-foreground rounded-bl-md franck-markdown'
            )}
          >
            {isUser ? (
              msg.content
            ) : (
              <div
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
              />
            )}
          </div>

          {/* Tool usage indicator */}
          {msg.toolsUsed && msg.toolsUsed.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1 ml-1">
              {'🔧'} Used: {msg.toolsUsed.join(', ')}
            </p>
          )}

          {/* Retry button on error messages */}
          {!isUser && msg.id.startsWith('error-') && (
            <button
              onClick={handleRetry}
              disabled={isLoading}
              className="flex items-center gap-1 mt-1.5 ml-1 text-[11px] font-medium text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Determine if we should show contextual suggestions ────────────────
  const lastMsg = messages[messages.length - 1];
  const showContextualSuggestions =
    !isLoading &&
    lastMsg?.role === 'assistant' &&
    !lastMsg.id.startsWith('error-') &&
    lastMsg.id !== 'welcome' &&
    !lastMsg.toolsUsed?.length &&
    !lastMsg.workflowName &&
    !lastMsg.chainName;

  // Pick 2-3 suggestions that differ from the last user message
  const contextSuggestions = showContextualSuggestions
    ? CONTEXTUAL_SUGGESTIONS
        .filter((s) => s.trigger !== lastUserMessageRef.current)
        .slice(0, 3)
    : [];

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
          'fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] sm:max-w-[420px] max-w-full overflow-hidden',
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
                className="w-[360px]"
              >
                <div className="space-y-4">
                  {/* Active model indicator with source badge */}
                  <div className={cn(
                    'rounded-lg px-3 py-2.5 flex items-center gap-2.5 transition-all duration-300',
                    modelJustChanged
                      ? 'bg-emerald-500/20 border border-emerald-400/40'
                      : usingOrgKey
                        ? 'bg-violet-500/10 border border-violet-500/20'
                        : 'bg-emerald-500/10 border border-emerald-500/20',
                  )}>
                    <Lock className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
                      modelJustChanged ? 'text-emerald-400' : usingOrgKey ? 'text-violet-400' : 'text-emerald-500',
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-[11px] font-semibold truncate transition-colors duration-300',
                        modelJustChanged ? 'text-emerald-300' : usingOrgKey ? 'text-violet-400' : 'text-emerald-400',
                      )}>
                        {modelJustChanged ? 'Updated!' : 'Active:'} {activeModelLabel}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {modelJustChanged
                          ? 'Configuration saved'
                          : usingOrgKey
                            ? 'Org key · shared with your team'
                            : usingFreeDefault
                              ? 'Free via OpenRouter · no key needed'
                              : 'Personal key'}
                      </p>
                    </div>
                    <span className={cn(
                      'text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0',
                      usingOrgKey
                        ? 'bg-violet-500/15 text-violet-400'
                        : usingFreeDefault
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-blue-500/15 text-blue-400',
                    )}>
                      {usingOrgKey ? 'Org' : usingFreeDefault ? 'Free' : 'Personal'}
                    </span>
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
                        const isRecommended = m.label.toLowerCase().includes('recommended');
                        const hasKey = hasCustomProviderConfig() || usingOrgKey;
                        const needsKey = !isFree && !hasKey;
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
                            {isRecommended && !isFree && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 uppercase tracking-wide">
                                Best
                              </span>
                            )}
                            {needsKey && !isFree && !isRecommended && (
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

                  {/* API Key + Scope selector */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">API Key</label>
                      {(usingOrgKey || keyStored) && (
                        <span className="ml-auto flex items-center gap-1 text-emerald-500 text-[10px] font-medium">
                          <Check className="h-3 w-3" /> {usingOrgKey ? 'Org key active' : 'Saved'}
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={
                        usingOrgKey
                          ? 'Org key active (enter new to replace)'
                          : keyStored
                            ? 'Key saved (enter new to replace)'
                            : PROVIDERS[selectedProvider].keyPlaceholder
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {/* Save scope toggle */}
                  {apiKeyInput.trim() && activeOrgId && (
                    <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/50">
                      <button
                        onClick={() => setSaveScope('org')}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all duration-150',
                          saveScope === 'org'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}
                      >
                        Save for team
                      </button>
                      <button
                        onClick={() => setSaveScope('personal')}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all duration-150',
                          saveScope === 'personal'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}
                      >
                        Just for me
                      </button>
                    </div>
                  )}

                  <Button
                    size="sm"
                    onClick={handleSaveKey}
                    disabled={!apiKeyInput.trim()}
                    className={cn('w-full', saveScope === 'org' && apiKeyInput.trim() && 'bg-violet-600 hover:bg-violet-700')}
                  >
                    {apiKeyInput.trim() && saveScope === 'org'
                      ? 'Save for Entire Team'
                      : 'Save Configuration'}
                  </Button>

                  {/* Helpful context */}
                  {saveScope === 'org' && apiKeyInput.trim() && activeOrgId && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed text-center">
                      Your team members will use this key automatically — no setup on their end.
                    </p>
                  )}

                  {/* OpenRouter onboarding */}
                  {selectedProvider === 'openrouter' && (
                    <div className="space-y-2">
                      {!usingOrgKey && !hasCustomProviderConfig() && (
                        <div className="rounded-md bg-muted/30 border border-border/50 px-3 py-2">
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-emerald-500">Free models work out of the box.</span>{' '}
                            Add an OpenRouter key to unlock faster, premium models like Gemini Flash (pennies/day):
                          </p>
                        </div>
                      )}
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
                        Get an OpenRouter key
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

            {/* Contextual follow-up suggestions */}
            {contextSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4 ml-9">
                {contextSuggestions.map((s) => (
                  <button
                    key={s.trigger}
                    onClick={() => handleSend(s.trigger)}
                    disabled={isLoading}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium',
                      'border border-fuchsia-500/30 bg-fuchsia-500/5',
                      'text-fuchsia-400 hover:text-fuchsia-300',
                      'hover:bg-fuchsia-500/15 transition-colors',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2 mb-4 justify-start">
                <Badge className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-violet-600 text-white text-xs border-0">
                  F
                </Badge>
                <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground space-y-1.5">
                  {/* Active tool execution indicator */}
                  {activeToolName ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-400" />
                      <span className="text-fuchsia-400 font-medium">
                        {'\uD83D\uDD27'} Executing: {activeToolName.replace(/_/g, ' ')}...
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="italic">
                        {LOADING_MESSAGES[loadingMsgIndex]}
                      </span>
                    </div>
                  )}
                  {/* Show list of already-executed tools during long chains */}
                  {executedTools.length > 1 && (
                    <div className="text-[11px] text-muted-foreground/70 ml-5 space-y-0.5">
                      {executedTools.slice(0, -1).map((tool, idx) => (
                        <div key={`${tool}-${idx}`} className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                          <span>{tool.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {executedTools.length > 0 && (
                    <p className="text-[11px] text-muted-foreground/50 ml-5">
                      {executedTools.length} tool{executedTools.length !== 1 ? 's' : ''} executed so far
                    </p>
                  )}
                  {loadingTooLong && (
                    <p className="text-[11px] text-amber-500/80 mt-1 italic">
                      This is taking longer than usual — Franck is working through a complex operation...
                    </p>
                  )}
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
                      <div key={step.id} className={cn(
                        'flex items-center gap-2 text-xs',
                        step.status === 'running' && 'bg-blue-500/10 -mx-1.5 px-1.5 py-0.5 rounded-md',
                      )}>
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
                          step.status === 'running' && 'text-blue-400 font-semibold',
                          step.status === 'pending' && 'text-muted-foreground/50',
                        )}>
                          {step.label}
                          {step.status === 'running' && ' — in progress'}
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
                      <div key={step.id} className={cn(
                        'flex items-center gap-2 text-xs',
                        step.status === 'running' && 'bg-blue-500/10 -mx-1.5 px-1.5 py-0.5 rounded-md',
                      )}>
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
                          step.status === 'running' && 'text-blue-400 font-semibold',
                          step.status === 'pending' && 'text-muted-foreground/50',
                        )}>
                          {step.description}
                          {step.status === 'running' && ' — in progress'}
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
                key={action.trigger}
                onClick={() => handleSend(action.trigger)}
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
                  <action.Icon className="h-3 w-3" />
                  {action.label}
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
