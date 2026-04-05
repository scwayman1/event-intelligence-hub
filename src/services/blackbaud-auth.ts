// ──────────────────────────────────────────────
// Blackbaud OAuth Client Helpers
// Handles the browser-side OAuth flow: building
// the authorize URL, exchanging codes via the
// Edge Function, and auto-refreshing tokens.
// ──────────────────────────────────────────────

import { supabase } from '@/integrations/supabase/client';
import type { BlackbaudConfig } from '@/types/blackbaud';

// ── Constants ───────────────────────────────────────────────────────────

const SKY_AUTH_URL = 'https://oauth2.sky.blackbaud.com/authorization';
const EDGE_FN_NAME = 'blackbaud-oauth';

/** Blackbaud OAuth client ID — safe to expose in the browser */
const CLIENT_ID = import.meta.env.VITE_BLACKBAUD_CLIENT_ID || '';

/** Where Blackbaud redirects after authorization */
function getRedirectUri(): string {
  return `${window.location.origin}/integrations/blackbaud/callback`;
}

// ── OAuth state management (CSRF protection) ────────────────────────────

function generateState(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem('bb_oauth_state', state);
  return state;
}

function validateState(state: string): boolean {
  const stored = sessionStorage.getItem('bb_oauth_state');
  sessionStorage.removeItem('bb_oauth_state');
  return stored === state;
}

/** Store pre-auth context so the callback can pick it up */
export function storeOAuthContext(orgId: string, subscriptionKey: string, environment: 'sandbox' | 'production') {
  sessionStorage.setItem('bb_oauth_context', JSON.stringify({ orgId, subscriptionKey, environment }));
}

export function getOAuthContext(): { orgId: string; subscriptionKey: string; environment: string } | null {
  try {
    const raw = sessionStorage.getItem('bb_oauth_context');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export function clearOAuthContext() {
  sessionStorage.removeItem('bb_oauth_context');
  sessionStorage.removeItem('bb_oauth_state');
}

// ── Initiate OAuth flow ─────────────────────────────────────────────────

/**
 * Redirect the user to Blackbaud's OAuth authorization page.
 * Call this when the user clicks "Connect with Blackbaud".
 */
export function initiateOAuth(orgId: string, subscriptionKey: string, environment: 'sandbox' | 'production') {
  if (!CLIENT_ID) {
    throw new Error('VITE_BLACKBAUD_CLIENT_ID is not configured. Add it to your .env file.');
  }

  // Store context for after redirect
  storeOAuthContext(orgId, subscriptionKey, environment);

  const state = generateState();
  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  });

  // Redirect to Blackbaud
  window.location.href = `${SKY_AUTH_URL}?${params.toString()}`;
}

// ── Exchange authorization code ─────────────────────────────────────────

/**
 * Exchange an authorization code for tokens via the Edge Function.
 * Called from the callback page after Blackbaud redirects back.
 */
export async function exchangeCode(code: string, state: string): Promise<{ success: boolean; error?: string }> {
  // Validate CSRF state
  if (!validateState(state)) {
    return { success: false, error: 'Invalid OAuth state — possible CSRF attack. Please try again.' };
  }

  const context = getOAuthContext();
  if (!context) {
    return { success: false, error: 'OAuth context lost. Please start the connection process again.' };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Not authenticated. Please sign in first.' };
  }

  const { data, error } = await supabase.functions.invoke(EDGE_FN_NAME, {
    body: {
      action: 'exchange_code',
      code,
      redirect_uri: getRedirectUri(),
      org_id: context.orgId,
      subscription_key: context.subscriptionKey,
      environment: context.environment,
    },
  });

  clearOAuthContext();

  if (error) {
    return { success: false, error: error.message || 'Token exchange failed' };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return { success: true };
}

// ── Token refresh ───────────────────────────────────────────────────────

/**
 * Refresh the access token via the Edge Function.
 * Returns a fresh BlackbaudConfig ready for API calls.
 */
export async function refreshTokens(orgId: string): Promise<BlackbaudConfig | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.functions.invoke(EDGE_FN_NAME, {
    body: {
      action: 'refresh_token',
      org_id: orgId,
    },
  });

  if (error || data?.error) {
    console.error('Token refresh failed:', error?.message || data?.error);
    return null;
  }

  return {
    subscriptionKey: data.subscription_key,
    accessToken: data.access_token,
    refreshToken: '', // Kept server-side
    tokenExpiresAt: data.token_expires_at,
    environment: data.environment,
  };
}

// ── Connection status ───────────────────────────────────────────────────

export interface ConnectionStatus {
  connected: boolean;
  needsRefresh?: boolean;
  connection?: {
    id: string;
    org_id: string;
    environment: string;
    token_expires_at: string;
    last_synced_at: string | null;
    sync_status: string;
    sync_error: string | null;
    webhook_enabled: boolean;
    created_at: string;
  };
}

/**
 * Check if the organization has an active Blackbaud connection.
 */
export async function getConnectionStatus(orgId: string): Promise<ConnectionStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { connected: false };

  const { data, error } = await supabase.functions.invoke(EDGE_FN_NAME, {
    body: {
      action: 'get_connection',
      org_id: orgId,
    },
  });

  if (error || !data) return { connected: false };

  return data as ConnectionStatus;
}

/**
 * Disconnect the Blackbaud integration for an organization.
 */
export async function disconnectBlackbaud(orgId: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { data, error } = await supabase.functions.invoke(EDGE_FN_NAME, {
    body: {
      action: 'disconnect',
      org_id: orgId,
    },
  });

  return !error && data?.success === true;
}

// ── Auto-refresh middleware ─────────────────────────────────────────────

/**
 * Get a valid BlackbaudConfig, auto-refreshing if the token is expired.
 * This is the main entry point for any code that needs to call the Blackbaud API.
 */
export async function getValidConfig(orgId: string): Promise<BlackbaudConfig | null> {
  const status = await getConnectionStatus(orgId);

  if (!status.connected) return null;

  if (status.needsRefresh) {
    return refreshTokens(orgId);
  }

  // Token is still valid — refresh to get the current access token
  return refreshTokens(orgId);
}
