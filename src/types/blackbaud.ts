// ──────────────────────────────────────────────
// Blackbaud SKY API Types
// For integrating with Blackbaud Award Management
// (formerly AcademicWorks) — scholarship recipients,
// donors, and award/fund data.
// ──────────────────────────────────────────────

/** OAuth + subscription key configuration for the Blackbaud SKY API */
export interface BlackbaudConfig {
  /** Bb-Api-Subscription-Key issued from the Blackbaud developer portal */
  subscriptionKey: string;
  /** OAuth 2.0 access token (Bearer) */
  accessToken: string;
  /** OAuth 2.0 refresh token for silent renewal */
  refreshToken: string;
  /** ISO-8601 timestamp when the access token expires */
  tokenExpiresAt: string;
  /** Target environment */
  environment: 'sandbox' | 'production';
}

// ── Constituent (person / org) ───────────────────────────────────────────

export interface BlackbaudEmailAddress {
  id: string;
  address: string;
  type: string;
  primary: boolean;
}

export interface BlackbaudPhone {
  id: string;
  number: string;
  type: string;
  primary: boolean;
}

export interface BlackbaudConstituentCode {
  id: string;
  description: string;
}

export interface BlackbaudConstituent {
  id: string;
  first_name: string;
  last_name: string;
  /** Populated after a secondary fetch to /emailaddresses */
  email?: string;
  /** Populated after a secondary fetch to /phones */
  phone?: string;
  type: 'Individual' | 'Organization';
  /** Constituent codes such as "Donor", "Scholarship Recipient", "Board Member" */
  constituent_code: BlackbaudConstituentCode[];
  /** Full list of email addresses (from sub-resource) */
  email_addresses?: BlackbaudEmailAddress[];
  /** Full list of phone numbers (from sub-resource) */
  phones?: BlackbaudPhone[];
}

// ── Gift (donation) ──────────────────────────────────────────────────────

export type BlackbaudGiftType =
  | 'Donation'
  | 'Pledge'
  | 'RecurringGift'
  | 'PlannedGift'
  | 'GiftInKind'
  | 'Other';

export interface BlackbaudGift {
  id: string;
  constituent_id: string;
  amount: { value: number };
  fund_id: string;
  fund_name: string;
  date: string;
  type: BlackbaudGiftType;
}

// ── Fund / Award ─────────────────────────────────────────────────────────

export interface BlackbaudFund {
  id: string;
  description: string;
  type: string;
  category: string;
}

/** Scholarship award linking a recipient to a fund */
export interface BlackbaudAward {
  id: string;
  recipient_id: string;
  fund_id: string;
  fund_name: string;
  amount: number;
  academic_year: string;
  status: 'Pending' | 'Accepted' | 'Declined' | 'Disbursed' | 'Cancelled';
}

// ── Import / Sync bookkeeping ────────────────────────────────────────────

export interface BlackbaudImportError {
  constituentId?: string;
  message: string;
  details?: string;
}

export interface BlackbaudImportResult {
  guestsAdded: number;
  guestsUpdated: number;
  relationshipGroupsCreated: number;
  errors: BlackbaudImportError[];
}

export interface BlackbaudPreviewResult {
  recipientCount: number;
  donorCount: number;
  fundCount: number;
}

export interface BlackbaudSyncState {
  lastSyncedAt: string | null;
  totalImported: number;
  status: 'idle' | 'syncing' | 'error';
  errorMessage?: string;
}

// ── Paginated list envelope returned by SKY API ──────────────────────────

export interface BlackbaudListResponse<T> {
  count: number;
  value: T[];
  next_link?: string;
}

// ── Search / filter params ───────────────────────────────────────────────

export interface ConstituentSearchParams {
  search_text?: string;
  constituent_code_id?: string;
  limit?: number;
  offset?: number;
}

export interface GiftSearchParams {
  constituent_id?: string;
  fund_id?: string;
  limit?: number;
  offset?: number;
}
