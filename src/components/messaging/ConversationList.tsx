import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Hash, Lock, Users, Search, Plus, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEventStore } from '@/data/store';
import type { Conversation, ConversationType } from '@/types/messaging';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conv: Conversation) => void;
  onCreateNew: () => void;
}

const typeIcon: Record<ConversationType, React.ReactNode> = {
  dm: <Lock className="w-3.5 h-3.5" />,
  group: <Users className="w-3.5 h-3.5" />,
  event_channel: <Hash className="w-3.5 h-3.5" />,
  role_channel: <Hash className="w-3.5 h-3.5" />,
};

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreateNew,
}: ConversationListProps) {
  const [search, setSearch] = useState('');
  const userProfile = useEventStore((s) => s.userProfile);
  const getUnreadCount = useEventStore((s) => s.getUnreadCount);
  const userId = userProfile?.id ?? '';

  const channels = conversations.filter(
    (c) => c.type === 'event_channel' || c.type === 'role_channel',
  );
  const dms = conversations.filter((c) => c.type === 'dm' || c.type === 'group');

  const filter = (list: Conversation[]) =>
    search.trim()
      ? list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
      : list;

  const renderItem = (conv: Conversation) => {
    const unread = getUnreadCount(userId, conv.id);
    const isActive = conv.id === activeId;

    return (
      <button
        key={conv.id}
        onClick={() => onSelect(conv)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
          isActive
            ? 'bg-violet-600/15 text-foreground'
            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        )}
      >
        <span className={cn(isActive ? 'text-violet-400' : 'text-muted-foreground/60')}>
          {typeIcon[conv.type]}
        </span>
        <div className="flex-1 min-w-0">
          <p className={cn('text-[13px] truncate', unread > 0 && 'font-semibold text-foreground')}>
            {conv.name}
          </p>
          {conv.lastMessagePreview && (
            <p className="text-[11px] text-muted-foreground/60 truncate">
              {conv.lastMessagePreview}
            </p>
          )}
        </div>
        {unread > 0 && (
          <span className="shrink-0 min-w-[20px] h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center px-1.5">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Messages</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCreateNew}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-7 text-xs bg-muted/30 border-border/60"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Channels */}
        {filter(channels).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1">
              Channels
            </p>
            <div className="space-y-0.5">{filter(channels).map(renderItem)}</div>
          </div>
        )}

        {/* Direct Messages */}
        {filter(dms).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1">
              Direct Messages
            </p>
            <div className="space-y-0.5">{filter(dms).map(renderItem)}</div>
          </div>
        )}

        {conversations.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground">No conversations yet</p>
            <Button variant="outline" size="sm" onClick={onCreateNew} className="text-xs gap-1.5">
              <Plus className="w-3 h-3" /> Start a conversation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
