import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Send,
  Bell,
  Sparkles,
  FileText,
} from 'lucide-react';
import { ConversationList } from '@/components/messaging/ConversationList';
import { ConversationView } from '@/components/messaging/ConversationView';
import { CreateConversationDialog } from '@/components/messaging/CreateConversationDialog';
import { GuestMessageComposer } from '@/components/messaging/GuestMessageComposer';
import { GuestMessageHistory } from '@/components/messaging/GuestMessageHistory';
import { AlertsFeed } from '@/components/messaging/AlertsFeed';
import type { Conversation } from '@/types/messaging';

type StreamTab = 'internal' | 'guest' | 'alerts';
type GuestSubTab = 'compose' | 'history';

const STREAM_TABS: { key: StreamTab; label: string; icon: React.ReactNode }[] = [
  { key: 'internal', label: 'Team', icon: <MessageSquare className="w-4 h-4" /> },
  { key: 'guest', label: 'Guest Comms', icon: <Send className="w-4 h-4" /> },
  { key: 'alerts', label: 'Alerts', icon: <Bell className="w-4 h-4" /> },
];

export default function MessagingHub() {
  const { eventId } = useParams();
  const userProfile = useEventStore((s) => s.userProfile);
  const getOrgEvents = useEventStore((s) => s.getOrgEvents);
  const getUserConversations = useEventStore((s) => s.getUserConversations);
  const getEventConversations = useEventStore((s) => s.getEventConversations);
  const getUnreadAlerts = useEventStore((s) => s.getUnreadAlerts);
  const getTotalUnreadCount = useEventStore((s) => s.getTotalUnreadCount);

  const [activeTab, setActiveTab] = useState<StreamTab>('internal');
  const [guestSubTab, setGuestSubTab] = useState<GuestSubTab>('compose');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const userId = userProfile?.id ?? '';
  const orgEvents = getOrgEvents();
  const event = orgEvents.find((e) => e.id === eventId);

  // Get conversations — scoped to event if we have one, otherwise all user convos
  const conversations = eventId
    ? getEventConversations(eventId)
    : getUserConversations(userId);

  const unreadAlerts = getUnreadAlerts().length;
  const unreadMessages = getTotalUnreadCount(userId);

  // Default to first event if no eventId for guest comms
  const guestEventId = eventId ?? orgEvents[0]?.id ?? '';

  // If there are no events and no eventId param, prompt user to create one
  if (orgEvents.length === 0 && !eventId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mx-auto">
            <MessageSquare className="w-7 h-7 text-violet-400" />
          </div>
          <p className="text-sm font-medium text-foreground">No events yet</p>
          <p className="text-sm text-muted-foreground">
            Create an event first to use messaging.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80 mb-1">
          <Sparkles className="w-3.5 h-3.5" /> communications hub
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {event ? `${event.name} — Messages` : 'Messages'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Internal team, guest communications, and system alerts
            </p>
          </div>
        </div>

        {/* Stream tabs */}
        <div className="flex gap-1 mt-4 bg-muted/30 rounded-lg p-1 w-fit">
          {STREAM_TABS.map((tab) => {
            const badge =
              tab.key === 'alerts' && unreadAlerts > 0
                ? unreadAlerts
                : tab.key === 'internal' && unreadMessages > 0
                  ? unreadMessages
                  : 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.icon}
                {tab.label}
                {badge > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Internal Team Messaging ──────────────────────────── */}
        {activeTab === 'internal' && (
          <>
            {/* Conversation sidebar */}
            <div className="w-72 border-r border-border shrink-0 overflow-hidden">
              <ConversationList
                conversations={conversations}
                activeId={activeConversation?.id ?? null}
                onSelect={setActiveConversation}
                onCreateNew={() => setShowCreateDialog(true)}
              />
            </div>

            {/* Chat area */}
            <div className="flex-1 overflow-hidden">
              {activeConversation ? (
                <ConversationView conversation={activeConversation} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mx-auto">
                      <MessageSquare className="w-7 h-7 text-violet-400" />
                    </div>
                    {conversations.length === 0 ? (
                      <>
                        <p className="text-sm font-medium text-foreground">
                          No conversations yet
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Start a new conversation to begin messaging your team.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Select a conversation or start a new one
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Guest Communications ─────────────────────────────── */}
        {activeTab === 'guest' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Sub-tabs */}
            <div className="shrink-0 px-4 py-2 border-b border-border flex gap-1">
              <button
                onClick={() => setGuestSubTab('compose')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  guestSubTab === 'compose'
                    ? 'bg-violet-600/15 text-violet-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                <FileText className="w-3.5 h-3.5" /> Compose
              </button>
              <button
                onClick={() => setGuestSubTab('history')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  guestSubTab === 'history'
                    ? 'bg-violet-600/15 text-violet-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                <Send className="w-3.5 h-3.5" /> Sent Messages
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {guestSubTab === 'compose' ? (
                <GuestMessageComposer eventId={guestEventId} />
              ) : (
                <GuestMessageHistory eventId={guestEventId} />
              )}
            </div>
          </div>
        )}

        {/* ── System Alerts ────────────────────────────────────── */}
        {activeTab === 'alerts' && (
          <div className="flex-1 overflow-y-auto">
            <AlertsFeed />
          </div>
        )}
      </div>

      {/* Create conversation dialog */}
      <CreateConversationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        eventId={eventId}
        onCreated={setActiveConversation}
      />
    </div>
  );
}
