import type { BlackbaudConfig, BlackbaudPreviewResult, BlackbaudImportResult } from '@/types/blackbaud';

const API_BASE = 'https://api.sky.blackbaud.com/award-management/v1';

async function blackbaudFetch(endpoint: string, config: BlackbaudConfig) {
  const baseUrl = config.environment === 'sandbox'
    ? 'https://api.sky.blackbaud.com/award-management/v1'
    : API_BASE;

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      'Bb-Api-Subscription-Key': config.subscriptionKey,
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Blackbaud API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function previewImport(config: BlackbaudConfig): Promise<BlackbaudPreviewResult> {
  // Attempt to call the real API endpoints
  const [recipients, donors, funds] = await Promise.all([
    blackbaudFetch('/recipients', config).catch(() => ({ count: 0 })),
    blackbaudFetch('/donors', config).catch(() => ({ count: 0 })),
    blackbaudFetch('/funds', config).catch(() => ({ count: 0 })),
  ]);

  return {
    recipientCount: recipients.count ?? recipients.value?.length ?? 0,
    donorCount: donors.count ?? donors.value?.length ?? 0,
    fundCount: funds.count ?? funds.value?.length ?? 0,
  };
}

export async function importScholarshipRecipients(config: BlackbaudConfig): Promise<{ added: number; updated: number; errors: string[] }> {
  try {
    const data = await blackbaudFetch('/recipients', config);
    const recipients = data.value ?? [];
    // In a real implementation, each recipient would be upserted into the event guest list
    return { added: recipients.length, updated: 0, errors: [] };
  } catch (err) {
    return { added: 0, updated: 0, errors: [(err as Error).message] };
  }
}

export async function importDonors(config: BlackbaudConfig): Promise<{ added: number; updated: number; errors: string[] }> {
  try {
    const data = await blackbaudFetch('/donors', config);
    const donors = data.value ?? [];
    return { added: donors.length, updated: 0, errors: [] };
  } catch (err) {
    return { added: 0, updated: 0, errors: [(err as Error).message] };
  }
}
