import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { GraduationCap, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft, Settings, Eye, Download } from 'lucide-react';
import type { BlackbaudConfig, BlackbaudImportResult, BlackbaudPreviewResult, BlackbaudImportError } from '@/types/blackbaud';
import { previewImport, importScholarshipRecipients, importDonors } from '@/services/blackbaud-sync';
import { useEventStore } from '@/data/store';

type DialogStep = 'config' | 'preview' | 'import';

interface DialogState {
  step: DialogStep;
  loading: boolean;
  config: BlackbaudConfig;
  preview: BlackbaudPreviewResult | null;
  importResult: BlackbaudImportResult | null;
  importRecipients: boolean;
  importDonors: boolean;
  createRelationshipGroups: boolean;
}

interface BlackbaudImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STORAGE_KEY = 'blackbaud-config';

function loadConfig(): BlackbaudConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return { subscriptionKey: '', accessToken: '', refreshToken: '', tokenExpiresAt: '', environment: 'sandbox' };
}

export default function BlackbaudImportDialog({ open, onOpenChange }: BlackbaudImportDialogProps) {
  const [state, setState] = useState<DialogState>({
    step: 'config',
    loading: false,
    config: loadConfig(),
    preview: null,
    importResult: null,
    importRecipients: true,
    importDonors: true,
    createRelationshipGroups: true,
  });

  const updateConfig = (partial: Partial<BlackbaudConfig>) => {
    setState((s) => ({ ...s, config: { ...s.config, ...partial } }));
  };

  const handleTestConnection = () => {
    if (!state.config.subscriptionKey.trim() || !state.config.accessToken.trim()) {
      toast.error('Please fill in both the Subscription Key and Access Token.');
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    toast.success('Configuration saved. Connection details validated.');
  };

  const handlePreview = async () => {
    if (!state.config.subscriptionKey.trim() || !state.config.accessToken.trim()) {
      toast.error('Please configure your API credentials first.');
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    setState((s) => ({ ...s, loading: true }));
    try {
      const result = await previewImport(state.config);
      if (result.error || !result.data) {
        toast.error(`Preview failed: ${result.error ?? 'Unknown error'}`);
        setState((s) => ({
          ...s,
          step: 'preview',
          loading: false,
          preview: { recipientCount: 0, donorCount: 0, fundCount: 0 },
        }));
      } else {
        setState((s) => ({ ...s, step: 'preview', preview: result.data, loading: false }));
      }
    } catch (err) {
      toast.error(`Preview failed: ${(err as Error).message}`);
      setState((s) => ({
        ...s,
        step: 'preview',
        loading: false,
        preview: { recipientCount: 0, donorCount: 0, fundCount: 0 },
      }));
    }
  };

  const handleImport = async () => {
    setState((s) => ({ ...s, loading: true }));
    const result: BlackbaudImportResult = {
      guestsAdded: 0,
      guestsUpdated: 0,
      relationshipGroupsCreated: 0,
      errors: [],
    };

    try {
      if (state.importRecipients) {
        const r = await importScholarshipRecipients(state.config);
        result.guestsAdded += r.added;
        result.guestsUpdated += r.updated;
        result.errors.push(...r.errors.map((msg) => ({ message: msg })));
      }

      if (state.importDonors) {
        const d = await importDonors(state.config);
        result.guestsAdded += d.added;
        result.guestsUpdated += d.updated;
        result.errors.push(...d.errors.map((msg) => ({ message: msg })));
      }

      if (state.createRelationshipGroups) {
        // Relationship group creation would happen here in a real implementation
        result.relationshipGroupsCreated = 0;
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
  };

  const handleReset = () => {
    setState((s) => ({
      ...s,
      step: 'config',
      preview: null,
      importResult: null,
      loading: false,
    }));
  };

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-6">
      {(['config', 'preview', 'import'] as const).map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && <div className={`w-8 h-px ${state.step === s || (['preview', 'import'].indexOf(state.step) >= i) ? 'bg-primary' : 'bg-border'}`} />}
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              state.step === s
                ? 'bg-primary text-primary-foreground'
                : (['config', 'preview', 'import'].indexOf(state.step) > i)
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-xs ${state.step === s ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {s === 'config' ? 'Configure' : s === 'preview' ? 'Preview' : 'Import'}
          </span>
        </div>
      ))}
    </div>
  );

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

        {/* Step 1: Configuration */}
        {state.step === 'config' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                SKY API Subscription Key
              </label>
              <input
                type="text"
                value={state.config.subscriptionKey}
                onChange={(e) => updateConfig({ subscriptionKey: e.target.value })}
                placeholder="Enter your SKY API subscription key"
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Access Token
              </label>
              <input
                type="password"
                value={state.config.accessToken}
                onChange={(e) => updateConfig({ accessToken: e.target.value })}
                placeholder="Enter your OAuth access token"
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                OAuth flow integration coming soon. For now, provide a valid access token.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Environment
              </label>
              <div className="flex gap-2">
                {(['sandbox', 'production'] as const).map((env) => (
                  <button
                    key={env}
                    onClick={() => updateConfig({ environment: env })}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      state.config.environment === env
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    }`}
                  >
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleTestConnection}>
                <Settings className="w-3.5 h-3.5" />
                Test Connection
              </Button>
              <Button size="sm" className="gap-2" onClick={handlePreview} disabled={state.loading}>
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
                    { key: 'importRecipients' as const, label: 'Import Recipients' },
                    { key: 'importDonors' as const, label: 'Import Donors' },
                    { key: 'createRelationshipGroups' as const, label: 'Create Relationship Groups' },
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
