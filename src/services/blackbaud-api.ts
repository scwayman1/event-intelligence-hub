// ──────────────────────────────────────────────
// Blackbaud SKY API Client
// OAuth 2.0 authorization-code flow with
// Bb-Api-Subscription-Key header.
// ──────────────────────────────────────────────

import type {
  BlackbaudConfig,
  BlackbaudConstituent,
  BlackbaudEmailAddress,
  BlackbaudPhone,
  BlackbaudGift,
  BlackbaudFund,
  BlackbaudListResponse,
  ConstituentSearchParams,
  GiftSearchParams,
} from '@/types/blackbaud';

// ── Constants ────────────────────────────────────────────────────────────

export const SKY_API_BASE_URL = 'https://api.sky.blackbaud.com';
export const SKY_AUTH_URL = 'https://oauth2.sky.blackbaud.com/authorization';
export const SKY_TOKEN_URL = 'https://oauth2.sky.blackbaud.com/token';

/** Default page size for list endpoints */
const DEFAULT_PAGE_SIZE = 500;

// ── Result wrapper ───────────────────────────────────────────────────────

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

function ok<T>(data: T): ApiResult<T> {
  return { data, error: null };
}

function fail<T>(error: string): ApiResult<T> {
  return { data: null, error };
}

// ── Internal helpers ─────────────────────────────────────────────────────

function buildHeaders(config: BlackbaudConfig): Record<string, string> {
  return {
    'Bb-Api-Subscription-Key': config.subscriptionKey,
    'Authorization': `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
  };
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path, SKY_API_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function skyGet<T>(config: BlackbaudConfig, path: string, params?: Record<string, string | number | undefined>): Promise<ApiResult<T>> {
  try {
    const url = buildUrl(path, params);
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(config),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return fail(`Blackbaud API error ${response.status}: ${body || response.statusText}`);
    }

    const data = (await response.json()) as T;
    return ok(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Network error calling Blackbaud API: ${message}`);
  }
}

// ── Token refresh ────────────────────────────────────────────────────────

/**
 * Refresh the OAuth 2.0 access token using the stored refresh token.
 * Returns an updated config with the new tokens, or an error.
 */
export async function refreshAccessToken(
  config: BlackbaudConfig,
  clientId: string,
  clientSecret: string,
): Promise<ApiResult<BlackbaudConfig>> {
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(SKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return fail(`Token refresh failed (${response.status}): ${text || response.statusText}`);
    }

    const json = await response.json();
    const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();

    return ok({
      ...config,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? config.refreshToken,
      tokenExpiresAt: expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Token refresh network error: ${message}`);
  }
}

// ── Constituent endpoints ────────────────────────────────────────────────

/**
 * List constituents with optional search / filter params.
 * GET /constituent/v1/constituents
 */
export async function getConstituents(
  config: BlackbaudConfig,
  params?: ConstituentSearchParams,
): Promise<ApiResult<BlackbaudListResponse<BlackbaudConstituent>>> {
  return skyGet<BlackbaudListResponse<BlackbaudConstituent>>(
    config,
    '/constituent/v1/constituents',
    {
      search_text: params?.search_text,
      constituent_code_id: params?.constituent_code_id,
      limit: params?.limit ?? DEFAULT_PAGE_SIZE,
      offset: params?.offset ?? 0,
    },
  );
}

/**
 * Get a single constituent by ID.
 * GET /constituent/v1/constituents/{id}
 */
export async function getConstituentById(
  config: BlackbaudConfig,
  id: string,
): Promise<ApiResult<BlackbaudConstituent>> {
  return skyGet<BlackbaudConstituent>(config, `/constituent/v1/constituents/${id}`);
}

/**
 * Get email addresses for a constituent.
 * GET /constituent/v1/constituents/{id}/emailaddresses
 */
export async function getConstituentEmails(
  config: BlackbaudConfig,
  constituentId: string,
): Promise<ApiResult<BlackbaudListResponse<BlackbaudEmailAddress>>> {
  return skyGet<BlackbaudListResponse<BlackbaudEmailAddress>>(
    config,
    `/constituent/v1/constituents/${constituentId}/emailaddresses`,
  );
}

/**
 * Get phone numbers for a constituent.
 * GET /constituent/v1/constituents/{id}/phones
 */
export async function getConstituentPhones(
  config: BlackbaudConfig,
  constituentId: string,
): Promise<ApiResult<BlackbaudListResponse<BlackbaudPhone>>> {
  return skyGet<BlackbaudListResponse<BlackbaudPhone>>(
    config,
    `/constituent/v1/constituents/${constituentId}/phones`,
  );
}

// ── Gift endpoints ───────────────────────────────────────────────────────

/**
 * List gifts with optional filters.
 * GET /gift/v1/gifts
 */
export async function getGifts(
  config: BlackbaudConfig,
  params?: GiftSearchParams,
): Promise<ApiResult<BlackbaudListResponse<BlackbaudGift>>> {
  return skyGet<BlackbaudListResponse<BlackbaudGift>>(
    config,
    '/gift/v1/gifts',
    {
      constituent_id: params?.constituent_id,
      fund_id: params?.fund_id,
      limit: params?.limit ?? DEFAULT_PAGE_SIZE,
      offset: params?.offset ?? 0,
    },
  );
}

// ── Fund endpoints ───────────────────────────────────────────────────────

/**
 * List all funds.
 * GET /fund/v1/funds
 */
export async function getFunds(
  config: BlackbaudConfig,
): Promise<ApiResult<BlackbaudListResponse<BlackbaudFund>>> {
  return skyGet<BlackbaudListResponse<BlackbaudFund>>(config, '/fund/v1/funds');
}

// ── Search helper ────────────────────────────────────────────────────────

/**
 * Convenience: search constituents by name/text.
 */
export async function searchConstituents(
  config: BlackbaudConfig,
  searchText: string,
): Promise<ApiResult<BlackbaudListResponse<BlackbaudConstituent>>> {
  return getConstituents(config, { search_text: searchText });
}

// ── Pagination helper ────────────────────────────────────────────────────

/**
 * Auto-paginate through a SKY API list endpoint, accumulating all items.
 *
 * @param fetchFn  A function that takes (config, offset) and returns a page.
 * @param config   The Blackbaud connection config.
 * @param pageSize Number of records per page (default 500).
 * @returns        All accumulated records, or an error from the first failing page.
 */
export async function fetchAllPages<T>(
  fetchFn: (config: BlackbaudConfig, offset: number) => Promise<ApiResult<BlackbaudListResponse<T>>>,
  config: BlackbaudConfig,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<ApiResult<T[]>> {
  const allItems: T[] = [];
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await fetchFn(config, offset);

    if (result.error || !result.data) {
      return fail(result.error ?? 'Unknown pagination error');
    }

    const page = result.data;
    allItems.push(...page.value);

    // If we received fewer items than the page size, we've hit the last page.
    if (page.value.length < pageSize || !page.next_link) {
      break;
    }

    offset += pageSize;
  }

  return ok(allItems);
}
