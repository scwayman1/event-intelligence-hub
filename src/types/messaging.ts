/**
 * Messaging System Types
 *
 * Three distinct streams:
 * 1. Internal — team DMs, group chats, event/role channels
 * 2. Guest — outbound communications, templates, delivery tracking
 * 3. System — automated alerts and notifications
 */

// ── Enums / Union Types ──────────────────────────────────────────────────────

export type MessageStream = 'internal' | 'guest' | 'system';
export type ConversationType = 'dm' | 'group' | 'event_channel' | 'role_channel';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type GuestMessageStatus = 'queued' | 'scheduled' | 'sent' | 'delivered' | 'bounced' | 'failed';
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';
export type TemplateCategory = 'rsvp_reminder' | 'thank_you' | 'check_in' | 'logistics' | 'donor_greeting' | 'parking' | 'custom';
export type SystemAlertType = 'rsvp_update' | 'capacity_warning' | 'task_assignment' | 'deadline' | 'seating_change' | 'error' | 'info';

// ── Internal Messaging ───────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  orgId: string;
  type: ConversationType;
  name: string;
  description?: string;
  eventId?: string;
  role?: string;
  participantIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  pinnedMessageIds: string[];
  lastMessageAt?: string;
  lastMessagePreview?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  threadParentId?: string;
  mentions: string[];
  attachments: MessageAttachment[];
  isPinned: boolean;
  priority: MessagePriority;
  createdAt: string;
  editedAt?: string;
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  dataUrl: string;
}

export interface ReadReceipt {
  userId: string;
  conversationId: string;
  lastReadMessageId: string;
  lastReadAt: string;
}

// ── Guest Communication ──────────────────────────────────────────────────────

export interface GuestMessage {
  id: string;
  orgId: string;
  eventId: string;
  senderId: string;
  senderName: string;
  recipientGuestIds: string[];
  subject: string;
  content: string;
  templateId?: string;
  scheduledAt?: string;
  sentAt?: string;
  status: GuestMessageStatus;
  deliveryResults: DeliveryResult[];
  isNote: boolean;
  createdAt: string;
}

export interface DeliveryResult {
  guestId: string;
  status: GuestMessageStatus;
  sentAt?: string;
  failureReason?: string;
}

export interface MessageTemplate {
  id: string;
  orgId: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── System Alerts ────────────────────────────────────────────────────────────

export interface SystemAlert {
  id: string;
  orgId: string;
  eventId?: string;
  type: SystemAlertType;
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  isRead: boolean;
  priority: MessagePriority;
  createdAt: string;
}

// ── Role Channel Presets ─────────────────────────────────────────────────────

export const ROLE_CHANNEL_PRESETS = [
  { role: 'seating', name: 'Seating', description: 'Seating arrangements and table assignments' },
  { role: 'donors', name: 'Donors', description: 'Donor relations and gift coordination' },
  { role: 'volunteers', name: 'Volunteers', description: 'Volunteer coordination and scheduling' },
  { role: 'check_in', name: 'Check-in', description: 'Day-of check-in operations' },
  { role: 'catering', name: 'Catering', description: 'Food, beverages, and dietary needs' },
  { role: 'logistics', name: 'Logistics', description: 'Venue, parking, AV, and setup' },
] as const;

// ── Template Presets ─────────────────────────────────────────────────────────

export const DEFAULT_TEMPLATES: Omit<MessageTemplate, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'RSVP Reminder',
    category: 'rsvp_reminder',
    subject: 'RSVP Reminder — {{eventName}}',
    content: 'Dear {{firstName}},\n\nWe hope this message finds you well! We wanted to follow up regarding your RSVP for {{eventName}} on {{eventDate}}.\n\nPlease confirm your attendance at your earliest convenience so we can finalize arrangements.\n\nWarm regards,\nThe Event Team',
  },
  {
    name: 'Thank You — Attendance',
    category: 'thank_you',
    subject: 'Thank You for Attending {{eventName}}',
    content: 'Dear {{firstName}},\n\nThank you so much for joining us at {{eventName}}. Your presence made the evening truly special.\n\nWe hope you enjoyed the event and look forward to seeing you again.\n\nWith gratitude,\nThe Event Team',
  },
  {
    name: 'Thank You — Donor',
    category: 'donor_greeting',
    subject: 'Thank You for Your Generous Support',
    content: 'Dear {{firstName}},\n\nOn behalf of the entire team, thank you for your generous contribution. Your support makes a profound difference in the lives of our scholarship recipients.\n\nWe are honored to have you as part of our community.\n\nWith deepest appreciation,\nThe Event Team',
  },
  {
    name: 'Check-in Instructions',
    category: 'check_in',
    subject: 'Check-in Details — {{eventName}}',
    content: 'Dear {{firstName}},\n\nWe are excited to see you at {{eventName}}! Here are your check-in details:\n\n📍 Venue: {{venueName}}\n🕐 Check-in opens: {{checkInTime}}\n🪑 Your table: {{tableName}}\n\nPlease have your confirmation ready at check-in. If you have any questions, do not hesitate to reach out.\n\nSee you there!\nThe Event Team',
  },
  {
    name: 'Parking & Logistics',
    category: 'logistics',
    subject: 'Parking & Directions — {{eventName}}',
    content: 'Dear {{firstName}},\n\nAs {{eventName}} approaches, here are some helpful logistics details:\n\n🅿️ Parking: Complimentary valet parking will be available at the main entrance.\n📍 Address: {{venueAddress}}\n👗 Dress code: {{dressCode}}\n\nWe look forward to welcoming you!\nThe Event Team',
  },
];
