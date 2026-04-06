import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  GraduationCap, CheckCircle2, AlertCircle, Loader2,
  ArrowRight, ArrowLeft, Eye, Download,
  Link2, Unlink, RefreshCw, Shield,
  Clock, Play, History, Settings,
} from 'lucide-react';
import type { BlackbaudConfig, BlackbaudImportResult, BlackbaudPreviewResult } from '@/types/blackbaud';
import { previewImport, importScholarshipRecipients, importDonors } from '@/services/blackbaud-sync';
import {
  initiateOAuth,
  getConnectionStatus,
  getValidConfig,
  disconnectBlackbaud,
  type ConnectionStatus,
} from '@/services/blackbaud-auth';
import {
  startAutoSync,
  stopAutoSync,
  getAutoSyncStatus,
  runSyncNow,
  fetchSyncHistory,
  type AutoSyncStatus,
  type SyncRunResult,
  type SyncLogEntry,
} from '@/services/blackbaud-scheduler';
import { useEventStore } from '@/data/store';

type DialogStep = 'connect' | 'preview' | 'import';

const SYNC_SETTINGS_KEY = 'blackbaud-sync-settings';

interface SyncSettings {
  autoSyncEnabled: boolean;
  intervalMinutes: number;
}

function loadSyncSettings(): SyncSettings {
  try {
    const saved = localStorage.getItem(SYNC_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        autoSyncEnabled: parsed.autoSyncEnabled ?? false,
        intervalMinutes: parsed.intervalMinutes ?? 60,
      };
    }
  } catch { /* ignore */ }
  return { autoSyncEnabled: false, intervalMinutes: 60 };
}

function saveSyncSettings(settings: SyncSettings): void {
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
}

const INTERVAL_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: 'Daily' },
] as const;

interface DialogState {
  step: DialogStep;
  loading: boolean;
  connectionStatus: ConnectionStatus | null;
  config: BlackbaudConfig | null;
  preview: BlackbaudPreviewResult | null;
  importResult: BlackbaudImportResult | null;
  importRecipients: boolean;
  importDonors: boolean;
  createRelationshipGroups: boolean;
  // Manual fallback fields
  manualMode: boolean;
  manualSubscriptionKey: string;
  manualAccessToken: string;
  manualEnvironment: 'sandbox' | 'production';
  // Sync settings
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  syncNowLoading: boolean;
  autoSyncStatus: AutoSyncStatus | null;
  syncHistory: SyncLogEntry[];
  syncHistoryLoading: boolean;
}

interface BlackbaudImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MANUAL_STORAGE_KEY = 'blackbaud-config';

function loadManualConfig(): { subscriptionKey: string; accessToken: string; environment: 'sandbox' | 'production' } {
  try {
    const saved = localStorage.getItem(MANUAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { subscriptionKey: parsed.subscriptionKey || '', accessToken: parsed.accessToken || '', environment: parsed.environment || 'sandbox' };
    }
  } catch { /* ignore */ }
  return { subscriptionKey: '', accessToken: '', environment: 'sandbox' };
}

export default function BlackbaudImportDialog({ open, onOpenChange }: BlackbaudImportDialogProps) {
  const { eventId } = useParams<{ eventId: string }>();
  const orgId = useEventStore((s) => s.activeOrgId || s.organizations?.[0]?.id || '');
  const hasClientId = !!import.meta.env.VITE_BLACKBAUD_CLIENT_ID;
  const manualDefaults = loadManualConfig();
  const syncDefaults = loadSyncSettings();

  const [state, setState] = useState<DialogState>({
    step: 'connect',
    loading: false,
    connectionStatus: null,
    config: null,
    preview: null,
    importResult: null,
    importRecipients: true,
    importDonors: true,
    createRelationshipGroups: true,
    manualMode: !hasClientId,
    manualSubscriptionKey: manualDefaults.subscriptionKey,
    manualAccessToken: manualDefaults.accessToken,
    manualEnvironment: manualDefaults.environment,
    // Sync settings
    autoSyncEnabled: syncDefaults.autoSyncEnabled,
    syncIntervalMinutes: syncDefaults.intervalMinutes,
    syncNowLoading: false,
    autoSyncStatus: null,
    syncHistory: [],
    syncHistoryLoading: false,
  });

  // Check connection status on open
  useEffect(() => {
    if (!open || !orgId) return;
    checkConnection();
  }, [open, orgId]);

  async function checkConnection() {
    if (!orgId) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const status = await getConnectionStatus(orgId);
      setState((s) => ({ ...s, connectionStatus: status, loading: false }));
    } catch {
      setState((s) => ({ ...s, connectionStatus: { connected: false }, loading: false }));
    }
  }

  // Refresh auto-sync status and history when connected
  const refreshSyncInfo = useCallback(async () => {
    if (!orgId) return;
    const status = getAutoSyncStatus(orgId);
    setState((s) => ({ ...s, autoSyncStatus: status, syncHistoryLoading: true }));
    try {
      const history = await fetchSyncHistory(orgId, 5);
      setState((s) => ({ ...s, syncHistory: history, syncHistoryLoading: false }));
    } catch {
      setState((s) => ({ ...s, syncHistoryLoading: false }));
    }
  }, [orgId]);

  useEffect(() => {
    if (!open || !orgId) return;
    void refreshSyncInfo();
  }, [open, orgId, refreshSyncInfo]);

  // Handle auto-sync toggle
  function handleAutoSyncToggle(enabled: boolean) {
    const activeEventId = eventId || useEventStore.getState().events?.[0]?.id || '';
    setState((s) => ({ ...s, autoSyncEnabled: enabled }));
    const settings: SyncSettings = { autoSyncEnabled: enabled, intervalMinutes: state.syncIntervalMinutes };
    saveSyncSettings(settings);

    if (enabled && activeEventId) {
      startAutoSync(orgId, activeEventId, state.syncIntervalMinutes);
      toast.success(`Auto-sync enabled (every ${INTERVAL_OPTIONS.find((o) => o.value === state.syncIntervalMinutes)?.label ?? state.syncIntervalMinutes + 'min'}).`);
    } else {
      stopAutoSync(orgId);
      if (!enabled) toast.info('Auto-sync disabled.');
    }
    setState((s) => ({ ...s, autoSyncStatus: getAutoSyncStatus(orgId) }));
  }

  function handleIntervalChange(minutes: number) {
    setState((s) => ({ ...s, syncIntervalMinutes: minutes }));
    const settings: SyncSettings = { autoSyncEnabled: state.autoSyncEnabled, intervalMinutes: minutes };
    saveSyncSettings(settings);

    // Restart if auto-sync is running
    if (state.autoSyncEnabled) {
      const activeEventId = eventId || useEventStore.getState().events?.[0]?.id || '';
      if (activeEventId) {
        startAutoSync(orgId, activeEventId, minutes);
        setState((s) => ({ ...s, autoSyncStatus: getAutoSyncStatus(orgId) }));
      }
    }
  }

  async function handleSyncNow() {
    const activeEventId = eventId || useEventStore.getState().events?.[0]?.id || '';
    if (!activeEventId) {
      toast.error('No active event selected.');
      return;
    }
    setState((s) => ({ ...s, syncNowLoading: true }));
    try {
      const result = await runSyncNow(orgId, activeEventId);
      if (result.success) {
        toast.success(`Sync complete: ${result.guestsAdded} added, ${result.guestsUpdated} updated.`);
      } else {
        toast.warning(`Sync completed with ${result.errorCount} error(s).`);
      }
      setState((s) => ({
        ...s,
        syncNowLoading: false,
        autoSyncStatus: getAutoSyncStatus(orgId),
      }));
      // Refresh history
      void refreshSyncInfo();
    } catch (err) {
      toast.error(`Sync failed: ${(err as Error).message}`);
      setState((s) => ({ ...s, syncNowLoading: false }));
    }
  }

  // ── OAuth connect ─────────────────────────────────────────────────────

  function handleOAuthConnect() {
    if (!state.manualSubscriptionKey.trim()) {
      toast.error('Please enter your SKY API Subscription Key first.');
      return;
    }
    // Store the event ID so callback can redirect back
    if (eventId) sessionStorage.setItem('bb_callback_event_id', eventId);
    initiateOAuth(orgId, state.manualSubscriptionKey.trim(), state.manualEnvironment);
  }

  // ── Disconnect ────────────────────────────────────────────────────────

  async function handleDisconnect() {
    setState((s) => ({ ...s, loading: true }));
    const success = await disconnectBlackbaud(orgId);
    if (success) {
      toast.success('Blackbaud disconnected.');
      setState((s) => ({
        ...s,
        connectionStatus: { connected: false },
        config: null,
        loading: false,
      }));
    } else {
      toast.error('Failed to disconnect.');
      setState((s) => ({ ...s, loading: false }));
    }
  }

  // ── Get config (OAuth or manual) ──────────────────────────────────────

  async function resolveConfig(): Promise<BlackbaudConfig | null> {
    if (state.manualMode) {
      // Manual mode — use entered credentials
      if (!state.manualSubscriptionKey.trim() || !state.manualAccessToken.trim()) {
        toast.error('Please fill in both the Subscription Key and Access Token.');
        return null;
      }
      const config: BlackbaudConfig = {
        subscriptionKey: state.manualSubscriptionKey.trim(),
        accessToken: state.manualAccessToken.trim(),
        refreshToken: '',
        tokenExpiresAt: '',
        environment: state.manualEnvironment,
      };
      localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(config));
      return config;
    }

    // OAuth mode — get a valid token from the server
    const config = await getValidConfig(orgId);
    if (!config) {
      toast.error('Failed to get valid Blackbaud credentials. Please reconnect.');
      return null;
    }
    return config;
  }

  // ── Preview ───────────────────────────────────────────────────────────

  async function handlePreview() {
    setState((s) => ({ ...s, loading: true }));
    const config = await resolveConfig();
    if (!config) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, config }));

    try {
      const result = await previewImport(config);
      if (result.error || !result.data) {
        toast.error(`Preview failed: ${result.error ?? 'Unknown error'}`);
        setState((s) => ({
          ...s, step: 'preview', loading: false,
          preview: { recipientCount: 0, donorCount: 0, fundCount: 0 },
        }));
      } else {
        setState((s) => ({ ...s, step: 'preview', preview: result.data, loading: false }));
      }
    } catch (err) {
      toast.error(`Preview failed: ${(err as Error).message}`);
      setState((s) => ({
        ...s, step: 'preview', loading: false,
        preview: { recipientCount: 0, donorCount: 0, fundCount: 0 },
      }));
    }
  }

  // ── Import ────────────────────────────────────────────────────────────

  async function handleImport() {
    setState((s) => ({ ...s, loading: true }));

    // Re-resolve config in case token expired during preview
    const config = state.config || await resolveConfig();
    if (!config) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const storeState = useEventStore.getState();
    const activeEventId = eventId || storeState.events?.[0]?.id || '';
    const activeOrgId = orgId || storeState.activeOrgId || storeState.organizations?.[0]?.id || '';

    const result: BlackbaudImportResult = {
      guestsAdded: 0, guestsUpdated: 0, relationshipGroupsCreated: 0, errors: [],
    };

    try {
      if (state.importRecipients) {
        const r = await importScholarshipRecipients(config, activeEventId, activeOrgId, {
          skipRelationships: !state.createRelationshipGroups,
        });
        result.guestsAdded += r.guestsAdded;
        result.guestsUpdated += r.guestsUpdated;
        result.relationshipGroupsCreated += r.relationshipGroupsCreated;
        result.errors.push(...r.errors);
      }

      if (state.importDonors) {
        const d = await importDonors(config, activeEventId, activeOrgId);
        result.guestsAdded += d.guestsAdded;
        result.guestsUpdated += d.guestsUpdated;
        result.errors.push(...d.errors);
      }

      setState((s) => ({ ...s, step: 'import', importResult: result, loading: false }));
      if (result.errors.length === 0) {
        toast.success('Import completed successfully.');
      } else {
        toast.warning(`Import completed with ${result.errors.length} error(s).`);
      }
    } catch (err) {
      result.errors.push({ message: (err as Error).message });
      setState((s) => ({ ...s, step: 'import', importResult: result, loading: false }));
      toast.error(`Import failed: ${(err as Error).message}`);
    }
  }

  function handleReset() {
    setState((s) => ({
      ...s, step: 'connect', preview: null, importResult: null, loading: false, config: null,
    }));
  }

  // ── Step indicator ────────────────────────────────────────────────────

  const steps = ['connect', 'preview', 'import'] as const;
  const stepLabels = { connect: 'Connect', preview: 'Preview', import: 'Import' };
  const currentIdx = steps.indexOf(state.step);

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && <div className={`w-8 h-px ${currentIdx >= i ? 'bg-primary' : 'bg-border'}`} />}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
            state.step === s ? 'bg-primary text-primary-foreground'
              : currentIdx > i ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}>
            {i + 1}
          </div>
          <span className={`text-xs ${state.step === s ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {stepLabels[s]}
          </span>
        </div>
      ))}
    </div>
  );

  const isConnected = state.connectionStatus?.connected === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            Blackbaud Award Management Import
          </DialogTitle>
          <DialogDescription>
            Import scholarship recipients and donors from AcademicWorks / Blackbaud Award Management
          </DialogDescription>
        </DialogHeader>

        {stepIndicator}

        {/* Step 1: Connect */}
        {state.step === 'connect' && (
          <div className="space-y-4">
            {/* Connection status banner */}
            {isConnected && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <div>
                    <span className="text-sm font-medium text-foreground">Connected to Blackbaud</span>
                    <p className="text-xs text-muted-foreground">
                      {state.connectionStatus?.connection?.environment === 'production' ? 'Production' : 'Sandbox'} environment
                      {state.connectionStatus?.connection?.last_synced_at &&
                        ` — Last sync: ${new Date(state.connectionStatus.connection.last_synced_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={handleDisconnect} disabled={state.loading}>
                  <Unlink className="w-3.5 h-3.5" />
                  Disconnect
                </Button>
              </div>
            )}

            {/* Sync Settings — only visible when connected */}
            {isConnected && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Settings className="w-4 h-4" />
                  Sync Settings
                </div>

                {/* Auto-sync toggle + interval */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.autoSyncEnabled}
                      onChange={(e) => handleAutoSyncToggle(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-foreground">Auto-sync enabled</span>
                  </label>
                  <select
                    value={state.syncIntervalMinutes}
                    onChange={(e) => handleIntervalChange(Number(e.target.value))}
                    disabled={!state.autoSyncEnabled}
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
                  >
                    {INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Sync Now button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleSyncNow}
                  disabled={state.syncNowLoading}
                >
                  {state.syncNowLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Sync Now
                </Button>

                {/* Last sync / next sync info */}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      Last sync:{' '}
                      {state.autoSyncStatus?.lastSyncAt
                        ? new Date(state.autoSyncStatus.lastSyncAt).toLocaleString()
                        : state.connectionStatus?.connection?.last_synced_at
                          ? new Date(state.connectionStatus.connection.last_synced_at).toLocaleString()
                          : 'Never'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    <span>
                      Next sync:{' '}
                      {state.autoSyncStatus?.running && state.autoSyncStatus.nextSyncAt
                        ? new Date(state.autoSyncStatus.nextSyncAt).toLocaleTimeString()
                        : 'Not scheduled'}
                    </span>
                  </div>
                </div>

                {/* Sync history */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                    <History className="w-3 h-3" />
                    Recent Sync History
                  </div>
                  {state.syncHistoryLoading ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </div>
                  ) : state.syncHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">No sync history yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {state.syncHistory.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between text-xs rounded px-2 py-1 bg-background border border-border"
                        >
                          <div className="flex items-center gap-1.5">
                            {entry.status === 'completed' ? (
                              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                            ) : entry.status === 'failed' ? (
                              <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
                            ) : (
                              <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                            )}
                            <span className="text-muted-foreground capitalize">{entry.sync_type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              +{entry.guests_added} / ~{entry.guests_updated}
                            </span>
                            <span className="text-muted-foreground">
                              {new Date(entry.started_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Subscription key — needed for both OAuth and manual */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                SKY API Subscription Key
              </label>
              <input
                type="text"
                value={state.manualSubscriptionKey}
                onChange={(e) => setState((s) => ({ ...s, manualSubscriptionKey: e.target.value }))}
                placeholder="Enter your SKY API subscription key"
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isConnected}
              />
              <p className="text-xs text-muted-foreground mt-1">
                From your Blackbaud developer portal application.
              </p>
            </div>

            {/* Environment selector */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Environment</label>
              <div className="flex gap-2">
                {(['sandbox', 'production'] as const).map((env) => (
                  <button
                    key={env}
                    onClick={() => setState((s) => ({ ...s, manualEnvironment: env }))}
                    disabled={isConnected}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      state.manualEnvironment === env
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    }`}
                  >
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* OAuth connect button */}
            {!isConnected && hasClientId && !state.manualMode && (
              <div className="pt-2 space-y-3">
                <Button className="w-full gap-2" onClick={handleOAuthConnect} disabled={state.loading}>
                  <Shield className="w-4 h-4" />
                  Connect with Blackbaud OAuth
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <button
                  onClick={() => setState((s) => ({ ...s, manualMode: true }))}
                  className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center"
                >
                  Or enter access token manually
                </button>
              </div>
            )}

            {/* Manual token entry fallback */}
            {!isConnected && (state.manualMode || !hasClientId) && (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Access Token</label>
                  <input
                    type="password"
                    value={state.manualAccessToken}
                    onChange={(e) => setState((s) => ({ ...s, manualAccessToken: e.target.value }))}
                    placeholder="Enter your OAuth access token"
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get a token from the <a href="https://developer.blackbaud.com/skyapi/docs/authorization/auth-code-flow" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Blackbaud developer portal</a>. Tokens expire after ~60 minutes.
                  </p>
                </div>
                {hasClientId && (
                  <button
                    onClick={() => setState((s) => ({ ...s, manualMode: false }))}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Use OAuth instead (recommended)
                  </button>
                )}
              </>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-2">
              {isConnected && state.connectionStatus?.needsRefresh && (
                <Button variant="outline" size="sm" className="gap-2" onClick={checkConnection} disabled={state.loading}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Token
                </Button>
              )}
              {!isConnected && !state.connectionStatus?.needsRefresh && <div />}
              <Button
                size="sm"
                className="gap-2"
                onClick={handlePreview}
                disabled={state.loading || (!isConnected && !state.manualMode && !state.manualAccessToken)}
              >
                {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                Preview Import
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {state.step === 'preview' && (
          <div className="space-y-4">
            {state.loading ? (
              <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Fetching data from Blackbaud...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Recipients', count: state.preview?.recipientCount ?? 0 },
                    { label: 'Donors', count: state.preview?.donorCount ?? 0 },
                    { label: 'Funds / Awards', count: state.preview?.fundCount ?? 0 },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">{item.count}</div>
                      <div className="text-xs text-muted-foreground mt-1">{item.label} found</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-sm font-medium text-foreground">Import Options</p>
                  {[
                    { key: 'importRecipients' as const, label: 'Import Scholarship Recipients' },
                    { key: 'importDonors' as const, label: 'Import Donors' },
                    { key: 'createRelationshipGroups' as const, label: 'Create Donor-Recipient Relationship Groups' },
                  ].map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={state[opt.key]}
                        onChange={(e) => setState((s) => ({ ...s, [opt.key]: e.target.checked }))}
                        className="rounded border-border"
                      />
                      <span className="text-sm text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </Button>
                  <Button size="sm" className="gap-2" onClick={handleImport} disabled={state.loading}>
                    <Download className="w-3.5 h-3.5" />
                    Import to Event
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Import Results */}
        {state.step === 'import' && (
          <div className="space-y-4">
            {state.loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Importing data...</span>
                <div className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full animate-pulse w-2/3" />
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-foreground font-medium">Import Complete</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xl font-bold text-foreground">{state.importResult?.guestsAdded ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Guests Added</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-foreground">{state.importResult?.guestsUpdated ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Updated</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-foreground">{state.importResult?.relationshipGroupsCreated ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Groups Created</div>
                    </div>
                  </div>
                </div>

                {state.importResult && state.importResult.errors.length > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span className="text-foreground font-medium">Errors ({state.importResult.errors.length})</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 pl-6 list-disc">
                      {state.importResult.errors.map((err, i) => (
                        <li key={i}>{err.message}{err.details ? ` — ${err.details}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Start Over
                  </Button>
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
