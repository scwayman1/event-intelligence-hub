/**
 * Messaging Store Slice
 *
 * Separated for maintainability — merged into the main store.
 * Handles conversations, messages, read receipts, guest comms,
 * templates, and system alerts.
 */

import type {
  Conversation,
  Message,
  ReadReceipt,
  GuestMessage,
  MessageTemplate,
  SystemAlert,
} from '@/types/messaging';

// ── Persisted State Defaults ─────────────────────────────────────────────────

export const MESSAGING_DEFAULTS = {
  conversations: [] as Conversation[],
  messages: [] as Message[],
  readReceipts: [] as ReadReceipt[],
  guestMessages: [] as GuestMessage[],
  messageTemplates: [] as MessageTemplate[],
  systemAlerts: [] as SystemAlert[],
};

export type MessagingState = typeof MESSAGING_DEFAULTS;

// ── Action Interface ─────────────────────────────────────────────────────────

export interface MessagingActions {
  // Conversations
  addConversation: (conv: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;

  // Messages
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  pinMessage: (id: string) => void;
  unpinMessage: (id: string) => void;

  // Read receipts
  markConversationRead: (userId: string, conversationId: string, lastMessageId: string) => void;

  // Selectors
  getConversationMessages: (conversationId: string) => Message[];
  getThreadMessages: (parentMessageId: string) => Message[];
  getUnreadCount: (userId: string, conversationId: string) => number;
  getTotalUnreadCount: (userId: string) => number;
  getUserConversations: (userId: string) => Conversation[];
  getEventConversations: (eventId: string) => Conversation[];
  searchMessages: (query: string) => Message[];

  // Guest messages
  addGuestMessage: (msg: GuestMessage) => void;
  updateGuestMessage: (id: string, updates: Partial<GuestMessage>) => void;
  getGuestMessageHistory: (guestId: string) => GuestMessage[];
  getEventGuestMessages: (eventId: string) => GuestMessage[];

  // Templates
  addMessageTemplate: (tmpl: MessageTemplate) => void;
  updateMessageTemplate: (id: string, updates: Partial<MessageTemplate>) => void;
  removeMessageTemplate: (id: string) => void;

  // System alerts
  addSystemAlert: (alert: SystemAlert) => void;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  getUnreadAlerts: () => SystemAlert[];
}

// ── Action Implementations ───────────────────────────────────────────────────

type SetFn = (fn: (state: MessagingState) => Partial<MessagingState>) => void;
type GetFn = () => MessagingState;

export function createMessagingActions(set: SetFn, get: GetFn): MessagingActions {
  return {
    // ── Conversations ──────────────────────────────────────
    addConversation: (conv) =>
      set((s) => ({ conversations: [...s.conversations, conv] })),

    updateConversation: (id, updates) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c,
        ),
      })),

    removeConversation: (id) =>
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        messages: s.messages.filter((m) => m.conversationId !== id),
      })),

    // ── Messages ───────────────────────────────────────────
    addMessage: (msg) =>
      set((s) => ({
        messages: [...s.messages, msg],
        conversations: s.conversations.map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessageAt: msg.createdAt,
                lastMessagePreview: msg.content.slice(0, 80),
                updatedAt: msg.createdAt,
              }
            : c,
        ),
      })),

    updateMessage: (id, updates) =>
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id ? { ...m, ...updates, editedAt: new Date().toISOString() } : m,
        ),
      })),

    removeMessage: (id) =>
      set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

    pinMessage: (id) =>
      set((s) => {
        const msg = s.messages.find((m) => m.id === id);
        if (!msg) return {};
        return {
          messages: s.messages.map((m) => (m.id === id ? { ...m, isPinned: true } : m)),
          conversations: s.conversations.map((c) =>
            c.id === msg.conversationId
              ? { ...c, pinnedMessageIds: [...c.pinnedMessageIds, id] }
              : c,
          ),
        };
      }),

    unpinMessage: (id) =>
      set((s) => {
        const msg = s.messages.find((m) => m.id === id);
        if (!msg) return {};
        return {
          messages: s.messages.map((m) => (m.id === id ? { ...m, isPinned: false } : m)),
          conversations: s.conversations.map((c) =>
            c.id === msg.conversationId
              ? { ...c, pinnedMessageIds: c.pinnedMessageIds.filter((pid) => pid !== id) }
              : c,
          ),
        };
      }),

    // ── Read Receipts ──────────────────────────────────────
    markConversationRead: (userId, conversationId, lastMessageId) =>
      set((s) => {
        const existing = s.readReceipts.findIndex(
          (r) => r.userId === userId && r.conversationId === conversationId,
        );
        const receipt: ReadReceipt = {
          userId,
          conversationId,
          lastReadMessageId: lastMessageId,
          lastReadAt: new Date().toISOString(),
        };
        if (existing >= 0) {
          const updated = [...s.readReceipts];
          updated[existing] = receipt;
          return { readReceipts: updated };
        }
        return { readReceipts: [...s.readReceipts, receipt] };
      }),

    // ── Selectors ──────────────────────────────────────────
    getConversationMessages: (conversationId) =>
      get()
        .messages.filter((m) => m.conversationId === conversationId && !m.threadParentId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

    getThreadMessages: (parentMessageId) =>
      get()
        .messages.filter((m) => m.threadParentId === parentMessageId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

    getUnreadCount: (userId, conversationId) => {
      const state = get();
      const receipt = state.readReceipts.find(
        (r) => r.userId === userId && r.conversationId === conversationId,
      );
      if (!receipt) {
        return state.messages.filter((m) => m.conversationId === conversationId && m.senderId !== userId).length;
      }
      return state.messages.filter(
        (m) =>
          m.conversationId === conversationId &&
          m.senderId !== userId &&
          m.createdAt > receipt.lastReadAt,
      ).length;
    },

    getTotalUnreadCount: (userId) => {
      const state = get();
      const convos = state.conversations.filter((c) => c.participantIds.includes(userId));
      let total = 0;
      for (const c of convos) {
        const receipt = state.readReceipts.find(
          (r) => r.userId === userId && r.conversationId === c.id,
        );
        if (!receipt) {
          total += state.messages.filter((m) => m.conversationId === c.id && m.senderId !== userId).length;
        } else {
          total += state.messages.filter(
            (m) =>
              m.conversationId === c.id &&
              m.senderId !== userId &&
              m.createdAt > receipt.lastReadAt,
          ).length;
        }
      }
      return total;
    },

    getUserConversations: (userId) =>
      get()
        .conversations.filter((c) => c.participantIds.includes(userId))
        .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt)),

    getEventConversations: (eventId) =>
      get().conversations.filter((c) => c.eventId === eventId),

    searchMessages: (query) => {
      const q = query.toLowerCase();
      return get().messages.filter((m) => m.content.toLowerCase().includes(q));
    },

    // ── Guest Messages ─────────────────────────────────────
    addGuestMessage: (msg) =>
      set((s) => ({ guestMessages: [...s.guestMessages, msg] })),

    updateGuestMessage: (id, updates) =>
      set((s) => ({
        guestMessages: s.guestMessages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      })),

    getGuestMessageHistory: (guestId) =>
      get()
        .guestMessages.filter((m) => m.recipientGuestIds.includes(guestId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    getEventGuestMessages: (eventId) =>
      get()
        .guestMessages.filter((m) => m.eventId === eventId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    // ── Templates ──────────────────────────────────────────
    addMessageTemplate: (tmpl) =>
      set((s) => ({ messageTemplates: [...s.messageTemplates, tmpl] })),

    updateMessageTemplate: (id, updates) =>
      set((s) => ({
        messageTemplates: s.messageTemplates.map((t) =>
          t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t,
        ),
      })),

    removeMessageTemplate: (id) =>
      set((s) => ({
        messageTemplates: s.messageTemplates.filter((t) => t.id !== id),
      })),

    // ── System Alerts ──────────────────────────────────────
    addSystemAlert: (alert) =>
      set((s) => ({ systemAlerts: [...s.systemAlerts, alert] })),

    markAlertRead: (id) =>
      set((s) => ({
        systemAlerts: s.systemAlerts.map((a) => (a.id === id ? { ...a, isRead: true } : a)),
      })),

    markAllAlertsRead: () =>
      set((s) => ({
        systemAlerts: s.systemAlerts.map((a) => ({ ...a, isRead: true })),
      })),

    getUnreadAlerts: () => get().systemAlerts.filter((a) => !a.isRead),
  };
}
