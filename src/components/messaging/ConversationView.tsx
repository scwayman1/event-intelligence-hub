import { useRef, useEffect, useMemo } from 'react';
import { Hash, Lock, Users, Pin } from 'lucide-react';
import { useEventStore } from '@/data/store';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation, MessageAttachment, MessagePriority } from '@/types/messaging';

interface ConversationViewProps {
  conversation: Conversation;
  onOpenThread?: (parentMessageId: string) => void;
}

export function ConversationView({ conversation, onOpenThread }: ConversationViewProps) {
  const userProfile = useEventStore((s) => s.userProfile);
  const messages = useEventStore((s) => s.getConversationMessages(conversation.id));
  const allMessages = useEventStore((s) => s.messages);
  const addMessage = useEventStore((s) => s.addMessage);
  const pinMessage = useEventStore((s) => s.pinMessage);
  const unpinMessage = useEventStore((s) => s.unpinMessage);
  const removeMessage = useEventStore((s) => s.removeMessage);
  const markConversationRead = useEventStore((s) => s.markConversationRead);
  const accounts = useEventStore((s) => s.accounts);

  const scrollRef = useRef<HTMLDivElement>(null);
  const userId = userProfile?.id ?? '';

  // Mark as read when viewing
  useEffect(() => {
    if (messages.length > 0 && userId) {
      markConversationRead(userId, conversation.id, messages[messages.length - 1].id);
    }
  }, [messages.length, userId, conversation.id, markConversationRead]);

  // Auto-scroll
  useEffect(() => {
    const viewport = scrollRef.current?.closest('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages.length]);

  // Pinned messages
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.isPinned),
    [messages],
  );

  // Thread counts
  const threadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allMessages
      .filter((m) => m.conversationId === conversation.id && m.threadParentId)
      .forEach((m) => {
        counts.set(m.threadParentId!, (counts.get(m.threadParentId!) ?? 0) + 1);
      });
    return counts;
  }, [allMessages, conversation.id]);

  // Participants for @mentions
  const participants = useMemo(
    () =>
      accounts
        .filter((a) => conversation.participantIds.includes(a.id))
        .map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}` })),
    [accounts, conversation.participantIds],
  );

  const handleSend = (content: string, attachments: MessageAttachment[], priority: MessagePriority) => {
    if (!userId || !userProfile) return;
    addMessage({
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      conversationId: conversation.id,
      senderId: userId,
      senderName: `${userProfile.firstName} ${userProfile.lastName}`,
      content,
      mentions: [],
      attachments,
      isPinned: false,
      priority,
      createdAt: new Date().toISOString(),
    });
  };

  const channelIcon = conversation.type === 'dm' ? (
    <Lock className="w-4 h-4 text-muted-foreground" />
  ) : conversation.type === 'group' ? (
    <Users className="w-4 h-4 text-muted-foreground" />
  ) : (
    <Hash className="w-4 h-4 text-muted-foreground" />
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
        {channelIcon}
        <div>
          <h2 className="text-sm font-semibold text-foreground">{conversation.name}</h2>
          {conversation.description && (
            <p className="text-[11px] text-muted-foreground">{conversation.description}</p>
          )}
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {conversation.participantIds.length} members
        </span>
      </div>

      {/* Pinned messages banner */}
      {pinnedMessages.length > 0 && (
        <div className="shrink-0 px-5 py-2 border-b border-amber-500/20 bg-amber-500/5 flex items-center gap-2 text-[11px] text-amber-500">
          <Pin className="w-3 h-3 fill-amber-500" />
          {pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="py-3">
          {messages.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <div className="w-12 h-12 rounded-full bg-violet-600/10 flex items-center justify-center mx-auto">
                {channelIcon}
              </div>
              <p className="text-sm text-muted-foreground">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.senderId === userId}
                threadCount={threadCounts.get(msg.id) ?? 0}
                onReply={() => onOpenThread?.(msg.id)}
                onPin={() => pinMessage(msg.id)}
                onUnpin={() => unpinMessage(msg.id)}
                onDelete={msg.senderId === userId ? () => removeMessage(msg.id) : undefined}
                onThreadClick={() => onOpenThread?.(msg.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0">
        <MessageInput
          onSend={handleSend}
          placeholder={`Message #${conversation.name}...`}
          participants={participants}
        />
      </div>
    </div>
  );
}
