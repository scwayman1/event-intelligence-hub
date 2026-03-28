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
} from 'lucide-react';
import {
  sendMessage,
  createConversation,
  hasApiKey,
  setApiKey,
  getApiKey,
} from '@/services/franck-agent';
import type {
  FranckConversation,
  FranckMessage,
} from '@/services/franck-agent';

// ─── Types ──────────────────────────────────────────────────────────────────

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

const WELCOME_MESSAGE: FranckMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Bonjour! I am Franck Eggelhoffer, and I am HERE to make your event absolutely MAGNIFIQUE! \u{1F3A9}\u2728 Ask me anything about your guests, seating, or I can take care of things for you. Franck lives to serve the art of the perfect event!',
  timestamp: Date.now(),
};

// ─── Component ──────────────────────────────────────────────────────────────

export function FranckChat({ eventId }: FranckChatProps) {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<FranckConversation | null>(
    null
  );
  const [messages, setMessages] = useState<FranckMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keyStored, setKeyStored] = useState(() => hasApiKey());

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
      if (!content || isLoading || !keyStored) return;

      // Create user message
      const userMsg: FranckMessage = {
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
          conv = await createConversation(eventId);
          setConversation(conv);
        }

        const response = await sendMessage(conv, content);
        setMessages((prev) => [...prev, response]);
      } catch {
        const errorMsg: FranckMessage = {
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

  // ── Save API key ───────────────────────────────────────────────────────
  const handleSaveKey = () => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setKeyStored(true);
      setApiKeyInput('');
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  const renderMessage = (msg: FranckMessage) => {
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
              \u{1F527} Used: {msg.toolsUsed.join(', ')}
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
                Franck Eggelhoffer \u{1F3A9}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your Event Planning Genius
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
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
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-medium">Anthropic API Key</h4>
                    {keyStored && (
                      <span className="ml-auto text-emerald-500 text-xs font-medium flex items-center gap-1">
                        \u2713 Saved
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      keyStored ? 'Key is saved (enter new to replace)' : 'sk-ant-...'
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveKey}
                    disabled={!apiKeyInput.trim()}
                    className="w-full"
                  >
                    Save Key
                  </Button>
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
                disabled={isLoading || !keyStored}
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
          {!keyStored && (
            <p className="text-xs text-amber-500 mb-2 text-center">
              Set API key first (click the gear icon above)
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
                  : 'Set API key first'
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
              disabled={!input.trim() || isLoading || !keyStored}
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
