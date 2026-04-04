// ──────────────────────────────────────────────
// Blackbaud Sync Service
// Transforms Blackbaud SKY API data into the app's
// Guest and RelationshipGroup models for event
// management of scholarship ceremonies.
// ──────────────────────────────────────────────

import type {
  BlackbaudConfig,
  BlackbaudConstituent,
  BlackbaudGift,
  BlackbaudImportResult,
  BlackbaudImportError,
  BlackbaudPreviewResult,
} from '@/types/blackbaud';
import type { Guest, RelationshipGroup, RelationshipMembership } from '@/types/events';

import {
  getConstituents,
  getConstituentEmails,
  getConstituentPhones,
  getGifts,
  getFunds,
  fetchAllPages,
} from '@/services/blackbaud-api';
import type { ApiResult } from '@/services/blackbaud-api';

// Lazy import to avoid circular deps — the store is only accessed at call time.
function getStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEventStore } = require('@/data/store');
  return useEventStore.getState() as {
    guests: Guest[];
    addGuest: (g: Guest) => void;
    updateGuest: (id: string, patch: Partial<Guest>) => void;
    relationshipGroups: RelationshipGroup[];
    addRelationshipGroup: (g: RelationshipGroup) => void;
    relationshipMemberships: RelationshipMembership[];
    addRelationshipMembership: (m: RelationshipMembership) => void;
  };
}

// ── ID generation (matches codebase conventions) ─────────────────────────

function guestId(): string {
  return `g-${crypto.randomUUID().slice(0, 8)}`;
}

function groupId(): string {
  return `rg-${crypto.randomUUID().slice(0, 8)}`;
}

function membershipId(): string {
  return `rm-${crypto.randomUUID().slice(0, 8)}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Pick the primary (or first available) email from a constituent's email list. */
function pickPrimaryEmail(emails: { address: string; primary: boolean }[]): string {
  const primary = emails.find((e) => e.primary);
  return primary?.address ?? emails[0]?.address ?? '';
}

/** Pick the primary (or first available) phone from a constituent's phone list. */
function pickPrimaryPhone(phones: { number: string; primary: boolean }[]): string {
  const primary = phones.find((p) => p.primary);
  return primary?.number ?? phones[0]?.number ?? '';
}

/** Find an existing guest by Blackbaud constituent ID stored in notes, or by email match. */
function findExistingGuest(guests: Guest[], constituent: BlackbaudConstituent): Guest | undefined {
  // First try matching by Blackbaud ID embedded in notes
  const byId = guests.find((g) => g.notes?.includes(`bbid:${constituent.id}`));
  if (byId) return byId;
  // Fallback: match by email
  if (constituent.email) {
    return guests.find(
      (g) => g.email.toLowerCase() === constituent.email!.toLowerCase(),
    );
  }
  return undefined;
}

/** Enrich a constituent with email + phone from sub-resources. */
async function enrichConstituent(
  config: BlackbaudConfig,
  constituent: BlackbaudConstituent,
): Promise<BlackbaudConstituent> {
  const enriched = { ...constituent };

  const emailResult = await getConstituentEmails(config, constituent.id);
  if (emailResult.data?.value) {
    enriched.email_addresses = emailResult.data.value;
    enriched.email = pickPrimaryEmail(emailResult.data.value);
  }

  const phoneResult = await getConstituentPhones(config, constituent.id);
  if (phoneResult.data?.value) {
    enriched.phones = phoneResult.data.value;
    enriched.phone = pickPrimaryPhone(phoneResult.data.value);
  }

  return enriched;
}

/** Build a Guest record from a Blackbaud constituent. */
function constituentToGuest(
  constituent: BlackbaudConstituent,
  eventId: string,
  orgId: string,
  category: Guest['category'],
  opts?: { fundName?: string; awardAmount?: number; confirmed?: boolean },
): Guest {
  const notes = [
    `bbid:${constituent.id}`,
    opts?.awardAmount != null ? `Award: $${opts.awardAmount.toLocaleString()}` : '',
    opts?.fundName ? `Fund: ${opts.fundName}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    id: guestId(),
    orgId,
    eventId,
    firstName: constituent.first_name,
    lastName: constituent.last_name,
    displayName: `${constituent.first_name} ${constituent.last_name}`,
    email: constituent.email ?? '',
    phone: constituent.phone ?? '',
    organization: opts?.fundName ?? '',
    category,
    rsvpStatus: opts?.confirmed ? 'confirmed' : 'invited',
    partySize: 1,
    dietaryRestrictions: '',
    accessibilityNeeds: '',
    notes,
    relationshipTags: [category === 'scholarship_recipient' ? 'Scholarship Recipient' : 'Donor'],
    tablePreference: '',
    seatingPreference: '',
  };
}

// ── Import options ───────────────────────────────────────────────────────

export interface ImportOptions {
  /** Constituent code to filter on (default: "Scholarship Recipient") */
  constituentCode?: string;
  /** When true, set rsvpStatus to 'confirmed' instead of 'invited' */
  markConfirmed?: boolean;
  /** If true, skip creating relationship groups */
  skipRelationships?: boolean;
}

// ── Main import: Scholarship Recipients ──────────────────────────────────

/**
 * Import scholarship recipients from Blackbaud into the app as Guests,
 * and optionally create RelationshipGroups linking donors to recipients
 * via shared funds.
 *
 * Steps:
 *  1. Fetch constituents with the target constituent code
 *  2. Enrich each with email addresses and phone numbers
 *  3. Fetch gifts/funds to determine award details
 *  4. Create/update Guest records
 *  5. Create RelationshipGroups for funds with both donors and recipients
 */
export async function importScholarshipRecipients(
  config: BlackbaudConfig,
  eventId: string,
  orgId: string,
  options?: ImportOptions,
): Promise<BlackbaudImportResult> {
  const constituentCode = options?.constituentCode ?? 'Scholarship Recipient';
  const result: BlackbaudImportResult = {
    guestsAdded: 0,
    guestsUpdated: 0,
    relationshipGroupsCreated: 0,
    errors: [],
  };

  // 1. Fetch constituents matching the code
  const allConstituents = await fetchAllPages<BlackbaudConstituent>(
    (cfg, offset) =>
      getConstituents(cfg, { search_text: constituentCode, limit: 500, offset }),
    config,
  );

  if (allConstituents.error || !allConstituents.data) {
    result.errors.push({ message: `Failed to fetch constituents: ${allConstituents.error}` });
    return result;
  }

  // Filter to those that actually carry the target constituent code
  const recipients = allConstituents.data.filter((c) =>
    c.constituent_code?.some(
      (code) => code.description.toLowerCase() === constituentCode.toLowerCase(),
    ),
  );

  // 2. Enrich each recipient with email/phone
  const enrichedRecipients: BlackbaudConstituent[] = [];
  for (const recipient of recipients) {
    try {
      const enriched = await enrichConstituent(config, recipient);
      enrichedRecipients.push(enriched);
    } catch (err) {
      result.errors.push({
        constituentId: recipient.id,
        message: `Failed to enrich constituent ${recipient.first_name} ${recipient.last_name}`,
        details: err instanceof Error ? err.message : String(err),
      });
      enrichedRecipients.push(recipient); // use un-enriched version
    }
  }

  // 3. Fetch gifts and funds to determine award details per recipient
  const giftsResult = await fetchAllPages<BlackbaudGift>(
    (cfg, offset) => getGifts(cfg, { limit: 500, offset }),
    config,
  );
  const fundsResult = await getFunds(config);

  const gifts = giftsResult.data ?? [];
  const funds = fundsResult.data?.value ?? [];

  // Build a map of fund_id -> fund name
  const fundNameMap = new Map<string, string>();
  for (const fund of funds) {
    fundNameMap.set(fund.id, fund.description);
  }
  // Also grab fund names from gifts themselves
  for (const gift of gifts) {
    if (gift.fund_name && gift.fund_id) {
      fundNameMap.set(gift.fund_id, gift.fund_name);
    }
  }

  // Map: fund_id -> { donors: constituentId[], recipients: constituentId[] }
  const fundMembership = new Map<
    string,
    { fundName: string; donors: Set<string>; recipients: Set<string> }
  >();

  // Associate gifts with donors
  for (const gift of gifts) {
    if (!fundMembership.has(gift.fund_id)) {
      fundMembership.set(gift.fund_id, {
        fundName: gift.fund_name || fundNameMap.get(gift.fund_id) || gift.fund_id,
        donors: new Set(),
        recipients: new Set(),
      });
    }
    fundMembership.get(gift.fund_id)!.donors.add(gift.constituent_id);
  }

  // Determine which fund each recipient is associated with by matching
  // gift records where the constituent is a known recipient.
  const recipientIds = new Set(enrichedRecipients.map((r) => r.id));
  for (const gift of gifts) {
    if (recipientIds.has(gift.constituent_id) && fundMembership.has(gift.fund_id)) {
      fundMembership.get(gift.fund_id)!.recipients.add(gift.constituent_id);
    }
  }

  // 4. Create Guest records
  const store = getStore();
  const constituentToGuestIdMap = new Map<string, string>(); // bbConstituentId -> app guestId

  for (const recipient of enrichedRecipients) {
    try {
      // Find award amount from gifts
      const recipientGifts = gifts.filter((g) => g.constituent_id === recipient.id);
      const totalAward = recipientGifts.reduce((sum, g) => sum + (g.amount?.value ?? 0), 0);
      const primaryFundId = recipientGifts[0]?.fund_id;
      const fundName = primaryFundId ? fundNameMap.get(primaryFundId) : undefined;

      const existing = findExistingGuest(store.guests, recipient);
      if (existing) {
        store.updateGuest(existing.id, {
          firstName: recipient.first_name,
          lastName: recipient.last_name,
          email: recipient.email ?? existing.email,
          phone: recipient.phone ?? existing.phone,
          notes: `bbid:${recipient.id} | Award: $${totalAward.toLocaleString()}${fundName ? ` | Fund: ${fundName}` : ''}`,
        });
        constituentToGuestIdMap.set(recipient.id, existing.id);
        result.guestsUpdated++;
      } else {
        const guest = constituentToGuest(recipient, eventId, orgId, 'scholarship_recipient', {
          fundName,
          awardAmount: totalAward > 0 ? totalAward : undefined,
          confirmed: options?.markConfirmed,
        });
        store.addGuest(guest);
        constituentToGuestIdMap.set(recipient.id, guest.id);
        result.guestsAdded++;
      }
    } catch (err) {
      result.errors.push({
        constituentId: recipient.id,
        message: `Failed to create guest for ${recipient.first_name} ${recipient.last_name}`,
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Create RelationshipGroups for funds with both donors and recipients
  if (!options?.skipRelationships) {
    for (const [fundId, membership] of fundMembership) {
      if (membership.donors.size === 0 || membership.recipients.size === 0) continue;

      try {
        const group: RelationshipGroup = {
          id: groupId(),
          eventId,
          orgId,
          name: membership.fundName,
          type: 'scholarship',
          notes: `Imported from Blackbaud fund ${fundId}`,
          createdAt: new Date().toISOString(),
        };
        store.addRelationshipGroup(group);
        result.relationshipGroupsCreated++;

        // Add donor memberships
        for (const donorBbId of membership.donors) {
          const appGuestId = constituentToGuestIdMap.get(donorBbId);
          if (appGuestId) {
            store.addRelationshipMembership({
              id: membershipId(),
              groupId: group.id,
              guestId: appGuestId,
              role: 'Donor',
            });
          }
        }

        // Add recipient memberships
        for (const recipientBbId of membership.recipients) {
          const appGuestId = constituentToGuestIdMap.get(recipientBbId);
          if (appGuestId) {
            store.addRelationshipMembership({
              id: membershipId(),
              groupId: group.id,
              guestId: appGuestId,
              role: 'Recipient',
            });
          }
        }
      } catch (err) {
        result.errors.push({
          message: `Failed to create relationship group for fund "${membership.fundName}"`,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return result;
}

// ── Import: Donors ───────────────────────────────────────────────────────

/**
 * Import donors from Blackbaud as Guest records with category 'donor'.
 */
export async function importDonors(
  config: BlackbaudConfig,
  eventId: string,
  orgId: string,
): Promise<BlackbaudImportResult> {
  const result: BlackbaudImportResult = {
    guestsAdded: 0,
    guestsUpdated: 0,
    relationshipGroupsCreated: 0,
    errors: [],
  };

  // Fetch all constituents, then filter for Donor / Major Donor codes
  const allConstituents = await fetchAllPages<BlackbaudConstituent>(
    (cfg, offset) => getConstituents(cfg, { limit: 500, offset }),
    config,
  );

  if (allConstituents.error || !allConstituents.data) {
    result.errors.push({ message: `Failed to fetch constituents: ${allConstituents.error}` });
    return result;
  }

  const donors = allConstituents.data.filter((c) =>
    c.constituent_code?.some((code) => {
      const desc = code.description.toLowerCase();
      return desc === 'donor' || desc === 'major donor';
    }),
  );

  const store = getStore();

  for (const donor of donors) {
    try {
      const enriched = await enrichConstituent(config, donor);
      const existing = findExistingGuest(store.guests, enriched);

      if (existing) {
        store.updateGuest(existing.id, {
          firstName: enriched.first_name,
          lastName: enriched.last_name,
          email: enriched.email ?? existing.email,
          phone: enriched.phone ?? existing.phone,
        });
        result.guestsUpdated++;
      } else {
        // Get total giving for notes
        const giftsResult = await getGifts(config, { constituent_id: enriched.id });
        const totalGiving = giftsResult.data?.value?.reduce(
          (sum, g) => sum + (g.amount?.value ?? 0),
          0,
        ) ?? 0;

        const guest = constituentToGuest(enriched, eventId, orgId, 'donor', {
          awardAmount: totalGiving > 0 ? totalGiving : undefined,
        });
        store.addGuest(guest);
        result.guestsAdded++;
      }
    } catch (err) {
      result.errors.push({
        constituentId: donor.id,
        message: `Failed to import donor ${donor.first_name} ${donor.last_name}`,
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ── Preview (dry run) ────────────────────────────────────────────────────

/**
 * Dry-run that returns counts of what would be imported without
 * creating any records.
 */
export async function previewImport(
  config: BlackbaudConfig,
): Promise<ApiResult<BlackbaudPreviewResult>> {
  const preview: BlackbaudPreviewResult = {
    recipientCount: 0,
    donorCount: 0,
    fundCount: 0,
  };

  // Fetch constituents
  const constituentsResult = await fetchAllPages<BlackbaudConstituent>(
    (cfg, offset) => getConstituents(cfg, { limit: 500, offset }),
    config,
  );

  if (constituentsResult.error || !constituentsResult.data) {
    return { data: null, error: constituentsResult.error ?? 'Failed to fetch constituents' };
  }

  for (const c of constituentsResult.data) {
    const codes = c.constituent_code?.map((code) => code.description.toLowerCase()) ?? [];
    if (codes.includes('scholarship recipient')) preview.recipientCount++;
    if (codes.includes('donor') || codes.includes('major donor')) preview.donorCount++;
  }

  // Fetch funds count
  const fundsResult = await getFunds(config);
  if (fundsResult.data) {
    preview.fundCount = fundsResult.data.count;
  }

  return { data: preview, error: null };
}
