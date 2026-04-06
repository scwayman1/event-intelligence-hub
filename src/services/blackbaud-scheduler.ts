// ──────────────────────────────────────────────
// Blackbaud Auto-Sync Scheduler
// Manages periodic background syncs of Blackbaud
// data using setInterval. Active intervals are
// stored in a module-level Map so they survive
// across component renders.
// ──────────────────────────────────────────────

import { supabase } from '@/integrations/supabase/client';
import { getValidConfig } from '@/services/blackbaud-auth';
import { importScholarshipRecipients, importDonors } from '@/services/blackbaud-sync';
import type { BlackbaudImportResult } from '@/types/blackbaud';

// ── Types ──────────────────────────────────────────────────────────────

export interface AutoSyncStatus {
  running: boolean;
  intervalMinutes: number | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastSyncResult: SyncRunResult | null;
}

export interface SyncRunResult {
  success: boolean;
  guestsAdded: number;
  guestsUpdated: number;
  relationshipGroupsCreated: number;
  errorCount: number;
  errorMessages: string[];
  completedAt: string;
}

export interface SyncLogEntry {
  id: string;
  sync_type: string;
  status: string;
  guests_added: number;
  guests_updated: number;
  groups_created: number;
  errors: unknown[];
  started_at: string;
  completed_at: string | null;
}

// ── Module-level state (survives across component renders) ─────────────

interface ActiveSync {
  intervalId: ReturnType<typeof setInterval>;
  intervalMinutes: number;
  eventId: string;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastResult: SyncRunResult | null;
}

const activeSyncs = new Map<string, ActiveSync>();

// ── Core sync execution ────────────────────────────────────────────────

/**
 * Execute a single sync cycle: fetch fresh tokens, import recipients
 * and donors, and log results to the database.
 */
async function executeSyncCycle(
  orgId: string,
  eventId: string,
  syncType: 'manual' | 'scheduled',
): Promise<SyncRunResult> {
  // Update connection status to 'syncing'
  await updateConnectionSyncStatus(orgId, 'syncing', null);

  // Get the connection ID for logging
  const connectionId = await getConnectionId(orgId);

  // Create a sync log entry with status 'started'
  let logId: string | null = null;
  if (connectionId) {
    logId = await createSyncLogEntry(connectionId, eventId, syncType);
  }

  try {
    // Get fresh tokens
    const config = await getValidConfig(orgId);
    if (!config) {
      const errorResult: SyncRunResult = {
        success: false,
        guestsAdded: 0,
        guestsUpdated: 0,
        relationshipGroupsCreated: 0,
        errorCount: 1,
        errorMessages: ['Failed to get valid Blackbaud credentials'],
        completedAt: new Date().toISOString(),
      };
      await updateConnectionSyncStatus(orgId, 'error', 'Failed to get valid credentials');
      if (logId) await completeSyncLogEntry(logId, 'failed', errorResult);
      return errorResult;
    }

    // Run both imports
    const combined: BlackbaudImportResult = {
      guestsAdded: 0,
      guestsUpdated: 0,
      relationshipGroupsCreated: 0,
      errors: [],
    };

    const recipientResult = await importScholarshipRecipients(config, eventId, orgId);
    combined.guestsAdded += recipientResult.guestsAdded;
    combined.guestsUpdated += recipientResult.guestsUpdated;
    combined.relationshipGroupsCreated += recipientResult.relationshipGroupsCreated;
    combined.errors.push(...recipientResult.errors);

    const donorResult = await importDonors(config, eventId, orgId);
    combined.guestsAdded += donorResult.guestsAdded;
    combined.guestsUpdated += donorResult.guestsUpdated;
    combined.errors.push(...donorResult.errors);

    const now = new Date().toISOString();
    const syncRunResult: SyncRunResult = {
      success: combined.errors.length === 0,
      guestsAdded: combined.guestsAdded,
      guestsUpdated: combined.guestsUpdated,
      relationshipGroupsCreated: combined.relationshipGroupsCreated,
      errorCount: combined.errors.length,
      errorMessages: combined.errors.map((e) => e.message),
      completedAt: now,
    };

    // Update connection with success state
    await updateConnectionSyncStatus(orgId, 'idle', null);
    await updateLastSyncedAt(orgId, now);

    // Update sync log
    if (logId) {
      await completeSyncLogEntry(
        logId,
        combined.errors.length === 0 ? 'completed' : 'completed',
        syncRunResult,
      );
    }

    return syncRunResult;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorResult: SyncRunResult = {
      success: false,
      guestsAdded: 0,
      guestsUpdated: 0,
      relationshipGroupsCreated: 0,
      errorCount: 1,
      errorMessages: [errorMessage],
      completedAt: new Date().toISOString(),
    };

    await updateConnectionSyncStatus(orgId, 'error', errorMessage);
    if (logId) await completeSyncLogEntry(logId, 'failed', errorResult);

    return errorResult;
  }
}

// ── Database helpers ───────────────────────────────────────────────────

async function getConnectionId(orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from('blackbaud_connections')
    .select('id')
    .eq('org_id', orgId)
    .maybeSingle();
  return data?.id ?? null;
}

async function updateConnectionSyncStatus(
  orgId: string,
  syncStatus: 'idle' | 'syncing' | 'error',
  syncError: string | null,
): Promise<void> {
  await supabase
    .from('blackbaud_connections')
    .update({ sync_status: syncStatus, sync_error: syncError })
    .eq('org_id', orgId);
}

async function updateLastSyncedAt(orgId: string, timestamp: string): Promise<void> {
  await supabase
    .from('blackbaud_connections')
    .update({ last_synced_at: timestamp })
    .eq('org_id', orgId);
}

async function createSyncLogEntry(
  connectionId: string,
  eventId: string,
  syncType: 'manual' | 'scheduled',
): Promise<string | null> {
  const { data } = await supabase
    .from('blackbaud_sync_log')
    .insert({
      connection_id: connectionId,
      event_id: eventId,
      sync_type: syncType,
      status: 'started',
      guests_added: 0,
      guests_updated: 0,
      groups_created: 0,
      errors: [],
    })
    .select('id')
    .single();
  return data?.id ?? null;
}

async function completeSyncLogEntry(
  logId: string,
  status: 'completed' | 'failed',
  result: SyncRunResult,
): Promise<void> {
  await supabase
    .from('blackbaud_sync_log')
    .update({
      status,
      guests_added: result.guestsAdded,
      guests_updated: result.guestsUpdated,
      groups_created: result.relationshipGroupsCreated,
      errors: result.errorMessages.map((msg) => ({ message: msg })),
      completed_at: result.completedAt,
    })
    .eq('id', logId);
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Start a periodic auto-sync for the given organization.
 * If one is already running, it is stopped and replaced.
 */
export function startAutoSync(
  orgId: string,
  eventId: string,
  intervalMinutes: number,
): void {
  // Stop any existing sync for this org
  stopAutoSync(orgId);

  const intervalMs = intervalMinutes * 60 * 1000;
  const now = new Date();
  const nextSync = new Date(now.getTime() + intervalMs);

  const entry: ActiveSync = {
    intervalId: setInterval(() => {
      void runScheduledSync(orgId, eventId);
    }, intervalMs),
    intervalMinutes,
    eventId,
    lastSyncAt: null,
    nextSyncAt: nextSync.toISOString(),
    lastResult: null,
  };

  activeSyncs.set(orgId, entry);
}

/**
 * Stop the auto-sync for the given organization.
 */
export function stopAutoSync(orgId: string): void {
  const existing = activeSyncs.get(orgId);
  if (existing) {
    clearInterval(existing.intervalId);
    activeSyncs.delete(orgId);
  }
}

/**
 * Get the current auto-sync status for an organization.
 */
export function getAutoSyncStatus(orgId: string): AutoSyncStatus {
  const entry = activeSyncs.get(orgId);
  if (!entry) {
    return {
      running: false,
      intervalMinutes: null,
      lastSyncAt: null,
      nextSyncAt: null,
      lastSyncResult: null,
    };
  }

  return {
    running: true,
    intervalMinutes: entry.intervalMinutes,
    lastSyncAt: entry.lastSyncAt,
    nextSyncAt: entry.nextSyncAt,
    lastSyncResult: entry.lastResult,
  };
}

/**
 * Manually trigger a sync outside the schedule.
 */
export async function runSyncNow(
  orgId: string,
  eventId: string,
): Promise<SyncRunResult> {
  const result = await executeSyncCycle(orgId, eventId, 'manual');

  // Update the active sync entry if one exists
  const entry = activeSyncs.get(orgId);
  if (entry) {
    entry.lastSyncAt = result.completedAt;
    entry.lastResult = result;
    // Recalculate next sync time
    entry.nextSyncAt = new Date(
      Date.now() + entry.intervalMinutes * 60 * 1000,
    ).toISOString();
  }

  return result;
}

/**
 * Fetch the last N sync log entries for an organization from the database.
 */
export async function fetchSyncHistory(
  orgId: string,
  limit = 5,
): Promise<SyncLogEntry[]> {
  const connectionId = await getConnectionId(orgId);
  if (!connectionId) return [];

  const { data } = await supabase
    .from('blackbaud_sync_log')
    .select('id, sync_type, status, guests_added, guests_updated, groups_created, errors, started_at, completed_at')
    .eq('connection_id', connectionId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((row) => ({
    id: row.id as string,
    sync_type: row.sync_type as string,
    status: row.status as string,
    guests_added: row.guests_added as number,
    guests_updated: row.guests_updated as number,
    groups_created: row.groups_created as number,
    errors: (row.errors ?? []) as unknown[],
    started_at: row.started_at as string,
    completed_at: row.completed_at as string | null,
  }));
}

// ── Internal helpers ───────────────────────────────────────────────────

async function runScheduledSync(orgId: string, eventId: string): Promise<void> {
  const entry = activeSyncs.get(orgId);
  if (!entry) return;

  try {
    const result = await executeSyncCycle(orgId, eventId, 'scheduled');
    entry.lastSyncAt = result.completedAt;
    entry.lastResult = result;
  } catch (err) {
    // Log error but do not stop the schedule
    console.error(`[Blackbaud Scheduler] Scheduled sync failed for org ${orgId}:`, err);
    entry.lastSyncAt = new Date().toISOString();
    entry.lastResult = {
      success: false,
      guestsAdded: 0,
      guestsUpdated: 0,
      relationshipGroupsCreated: 0,
      errorCount: 1,
      errorMessages: [err instanceof Error ? err.message : String(err)],
      completedAt: new Date().toISOString(),
    };
  }

  // Recalculate next sync time
  entry.nextSyncAt = new Date(
    Date.now() + entry.intervalMinutes * 60 * 1000,
  ).toISOString();
}
