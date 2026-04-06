// ──────────────────────────────────────────────
// Blackbaud Webhook Receiver
// Receives real-time constituent and gift change
// notifications from Blackbaud SKY API webhooks.
// Updates guest records in Supabase accordingly.
// ──────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-blackbaud-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface WebhookPayload {
  subscription_id: string;
  event_type: string;
  // Blackbaud webhook event types:
  // constituent.created, constituent.updated, constituent.deleted
  // gift.created, gift.updated
  data: {
    id: string;
    constituent_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    amount?: { value: number };
    fund_id?: string;
    fund_name?: string;
    [key: string]: unknown;
  };
  occurred_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawBody = await req.text();
    const payload: WebhookPayload = JSON.parse(rawBody);

    // Validate webhook signature if configured
    const signature = req.headers.get('x-blackbaud-signature');
    if (signature) {
      const isValid = await validateSignature(supabase, rawBody, signature, payload.subscription_id);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return jsonResponse({ error: 'Invalid signature' }, 401);
      }
    }

    console.log(`Webhook received: ${payload.event_type} for ${payload.data.id}`);

    // Process based on event type
    switch (payload.event_type) {
      case 'constituent.updated':
        await handleConstituentUpdate(supabase, payload);
        break;
      case 'constituent.created':
        // New constituents aren't auto-imported — they come via manual import
        console.log('New constituent created in Blackbaud (not auto-importing):', payload.data.id);
        break;
      case 'constituent.deleted':
        await handleConstituentDeleted(supabase, payload);
        break;
      case 'gift.created':
      case 'gift.updated':
        await handleGiftChange(supabase, payload);
        break;
      default:
        console.log('Unhandled webhook event type:', payload.event_type);
    }

    // Log the webhook event
    await logWebhookEvent(supabase, payload);

    return jsonResponse({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return jsonResponse({ error: 'Processing failed' }, 500);
  }
});

// ── Handlers ────────────────────────────────────────────────────────────

async function handleConstituentUpdate(
  supabase: ReturnType<typeof createClient>,
  payload: WebhookPayload,
) {
  const bbId = payload.data.id;

  // Find guests linked to this Blackbaud constituent
  const { data: guests } = await supabase
    .from('guests')
    .select('id, event_id, notes')
    .like('notes', `%bbid:${bbId}%`);

  if (!guests || guests.length === 0) {
    console.log(`No linked guests found for Blackbaud constituent ${bbId}`);
    return;
  }

  // Build update patch from webhook data
  const patch: Record<string, unknown> = {};
  if (payload.data.first_name || payload.data.last_name) {
    const firstName = payload.data.first_name ?? '';
    const lastName = payload.data.last_name ?? '';
    patch.display_name = `${firstName} ${lastName}`.trim();
    patch.first_name = firstName;
    patch.last_name = lastName;
  }
  if (payload.data.email) {
    patch.email = payload.data.email;
  }
  if (payload.data.phone) {
    patch.phone = payload.data.phone;
  }

  if (Object.keys(patch).length === 0) {
    console.log('No updatable fields in webhook payload');
    return;
  }

  // Update all linked guest records
  for (const guest of guests) {
    const { error } = await supabase
      .from('guests')
      .update(patch)
      .eq('id', guest.id);

    if (error) {
      console.error(`Failed to update guest ${guest.id}:`, error);
    } else {
      console.log(`Updated guest ${guest.id} from webhook`);

      // Log sync entry
      await supabase.from('blackbaud_sync_log').insert({
        connection_id: await getConnectionIdForEvent(supabase, guest.event_id),
        event_id: guest.event_id,
        sync_type: 'webhook',
        status: 'completed',
        guests_updated: 1,
        completed_at: new Date().toISOString(),
      });
    }
  }
}

async function handleConstituentDeleted(
  supabase: ReturnType<typeof createClient>,
  payload: WebhookPayload,
) {
  const bbId = payload.data.id;

  // Don't auto-delete guests — just flag them
  const { data: guests } = await supabase
    .from('guests')
    .select('id, notes')
    .like('notes', `%bbid:${bbId}%`);

  if (!guests || guests.length === 0) return;

  for (const guest of guests) {
    const updatedNotes = (guest.notes || '') + ` [Blackbaud record deleted ${new Date().toISOString()}]`;
    await supabase
      .from('guests')
      .update({ notes: updatedNotes })
      .eq('id', guest.id);
    console.log(`Flagged guest ${guest.id} — Blackbaud constituent deleted`);
  }
}

async function handleGiftChange(
  supabase: ReturnType<typeof createClient>,
  payload: WebhookPayload,
) {
  if (!payload.data.constituent_id) return;

  const bbId = payload.data.constituent_id;
  const { data: guests } = await supabase
    .from('guests')
    .select('id, notes')
    .like('notes', `%bbid:${bbId}%`);

  if (!guests || guests.length === 0) return;

  // Update gift info in notes
  const giftInfo = payload.data.amount
    ? `Latest gift: $${payload.data.amount.value} to ${payload.data.fund_name || 'unknown fund'}`
    : '';

  if (giftInfo) {
    for (const guest of guests) {
      // Append or update gift info in notes
      let notes = guest.notes || '';
      const giftPattern = /Latest gift: \$[\d,.]+ to .+/;
      if (giftPattern.test(notes)) {
        notes = notes.replace(giftPattern, giftInfo);
      } else {
        notes = notes ? `${notes} | ${giftInfo}` : giftInfo;
      }

      await supabase
        .from('guests')
        .update({ notes })
        .eq('id', guest.id);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function validateSignature(
  supabase: ReturnType<typeof createClient>,
  body: string,
  signature: string,
  subscriptionId: string,
): Promise<boolean> {
  // Look up the webhook secret for this subscription
  const { data: connections } = await supabase
    .from('blackbaud_connections')
    .select('webhook_secret')
    .eq('webhook_enabled', true)
    .not('webhook_secret', 'is', null);

  if (!connections || connections.length === 0) return false;

  for (const conn of connections) {
    try {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(conn.webhook_secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
      const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

      if (computed === signature) return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function getConnectionIdForEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
): Promise<string> {
  // Get the org_id for this event, then find the connection
  const { data: event } = await supabase
    .from('events')
    .select('org_id')
    .eq('id', eventId)
    .single();

  if (!event) return '';

  const { data: conn } = await supabase
    .from('blackbaud_connections')
    .select('id')
    .eq('org_id', event.org_id)
    .single();

  return conn?.id || '';
}

async function logWebhookEvent(
  supabase: ReturnType<typeof createClient>,
  payload: WebhookPayload,
) {
  // Log to a simple audit trail in sync_log
  console.log(`[Webhook] ${payload.event_type} at ${payload.occurred_at}: ${JSON.stringify(payload.data).slice(0, 200)}`);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
