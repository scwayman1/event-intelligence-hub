// ──────────────────────────────────────────────
// Blackbaud OAuth Edge Function
// Handles authorization code exchange, token
// refresh, and connection management. Keeps
// client_secret server-side.
// ──────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SKY_TOKEN_URL = 'https://oauth2.sky.blackbaud.com/token';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Verify the user is authenticated via Supabase JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the JWT and get the user
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  // Get Blackbaud app credentials from environment
  const clientId = Deno.env.get('BLACKBAUD_CLIENT_ID');
  const clientSecret = Deno.env.get('BLACKBAUD_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'Blackbaud app credentials not configured on server' }, 500);
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'exchange_code':
        return await handleCodeExchange(supabase, user.id, body, clientId, clientSecret);
      case 'refresh_token':
        return await handleTokenRefresh(supabase, user.id, body, clientId, clientSecret);
      case 'get_connection':
        return await handleGetConnection(supabase, body);
      case 'disconnect':
        return await handleDisconnect(supabase, body);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('Blackbaud OAuth error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

// ── Exchange authorization code for tokens ──────────────────────────────

async function handleCodeExchange(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: { code: string; redirect_uri: string; org_id: string; subscription_key: string; environment: string },
  clientId: string,
  clientSecret: string,
) {
  const { code, redirect_uri, org_id, subscription_key, environment } = body;

  if (!code || !redirect_uri || !org_id || !subscription_key) {
    return jsonResponse({ error: 'Missing required fields: code, redirect_uri, org_id, subscription_key' }, 400);
  }

  // Exchange authorization code for tokens
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(SKY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.error('Token exchange failed:', tokenRes.status, errText);
    return jsonResponse({ error: `Token exchange failed: ${tokenRes.status}` }, 400);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Upsert the connection (one per org)
  const { data, error } = await supabase
    .from('blackbaud_connections')
    .upsert(
      {
        org_id,
        subscription_key,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
        environment: environment || 'sandbox',
        connected_by: userId,
        sync_status: 'idle',
        sync_error: null,
      },
      { onConflict: 'org_id' },
    )
    .select()
    .single();

  if (error) {
    console.error('DB upsert error:', error);
    return jsonResponse({ error: 'Failed to save connection' }, 500);
  }

  return jsonResponse({
    success: true,
    connection: {
      id: data.id,
      org_id: data.org_id,
      environment: data.environment,
      connected: true,
      token_expires_at: data.token_expires_at,
    },
  });
}

// ── Refresh access token ────────────────────────────────────────────────

async function handleTokenRefresh(
  supabase: ReturnType<typeof createClient>,
  _userId: string,
  body: { org_id: string },
  clientId: string,
  clientSecret: string,
) {
  const { org_id } = body;
  if (!org_id) {
    return jsonResponse({ error: 'Missing org_id' }, 400);
  }

  // Get current connection
  const { data: conn, error: fetchErr } = await supabase
    .from('blackbaud_connections')
    .select('*')
    .eq('org_id', org_id)
    .single();

  if (fetchErr || !conn) {
    return jsonResponse({ error: 'No Blackbaud connection found for this organization' }, 404);
  }

  // Refresh the token
  const tokenBody = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(SKY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.error('Token refresh failed:', tokenRes.status, errText);

    // Mark connection as errored
    await supabase
      .from('blackbaud_connections')
      .update({ sync_status: 'error', sync_error: 'Token refresh failed — reconnection required' })
      .eq('org_id', org_id);

    return jsonResponse({ error: 'Token refresh failed. Please reconnect your Blackbaud account.' }, 401);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Update stored tokens
  const { error: updateErr } = await supabase
    .from('blackbaud_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? conn.refresh_token,
      token_expires_at: expiresAt,
      sync_status: 'idle',
      sync_error: null,
    })
    .eq('org_id', org_id);

  if (updateErr) {
    console.error('Failed to update tokens:', updateErr);
    return jsonResponse({ error: 'Failed to save refreshed tokens' }, 500);
  }

  // Return the fresh access token to the client for immediate use
  return jsonResponse({
    success: true,
    access_token: tokens.access_token,
    token_expires_at: expiresAt,
    subscription_key: conn.subscription_key,
    environment: conn.environment,
  });
}

// ── Get connection status ───────────────────────────────────────────────

async function handleGetConnection(
  supabase: ReturnType<typeof createClient>,
  body: { org_id: string },
) {
  const { org_id } = body;
  if (!org_id) {
    return jsonResponse({ error: 'Missing org_id' }, 400);
  }

  const { data: conn, error } = await supabase
    .from('blackbaud_connections')
    .select('id, org_id, environment, token_expires_at, last_synced_at, sync_status, sync_error, webhook_enabled, created_at')
    .eq('org_id', org_id)
    .single();

  if (error || !conn) {
    return jsonResponse({ connected: false });
  }

  const isExpired = new Date(conn.token_expires_at) < new Date();

  return jsonResponse({
    connected: true,
    needs_refresh: isExpired,
    connection: conn,
  });
}

// ── Disconnect ──────────────────────────────────────────────────────────

async function handleDisconnect(
  supabase: ReturnType<typeof createClient>,
  body: { org_id: string },
) {
  const { org_id } = body;
  if (!org_id) {
    return jsonResponse({ error: 'Missing org_id' }, 400);
  }

  const { error } = await supabase
    .from('blackbaud_connections')
    .delete()
    .eq('org_id', org_id);

  if (error) {
    return jsonResponse({ error: 'Failed to disconnect' }, 500);
  }

  return jsonResponse({ success: true, connected: false });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
