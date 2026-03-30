import { useState, useCallback } from "react";
import {
  fetchOrgMemberships,
  fetchOrganizations,
  fetchEvents,
  fetchGuests,
  fetchVersions,
  fetchLayoutObjects,
  fetchSeatingAssignments,
  fetchSeatingRules,
  fetchRelationshipGroups,
  fetchRelationshipMemberships,
  fetchCollaborators,
} from "@/services/supabase-db";
import { useEventStore } from "@/data/store";
import { setOrgLLMConfig } from "@/services/llm-providers";

export function useSupabaseSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncAll = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch org memberships for the user
      const orgIds = await fetchOrgMemberships(userId);

      // New user with no memberships — nothing to sync
      // IMPORTANT: Do NOT clear localStorage here. The user may have local
      // data that hasn't been written to Supabase yet (e.g. due to RLS
      // policy issues or network failures). Only clear on explicit sign-out.
      if (orgIds.length === 0) {
        console.log('[supabase-sync] No org memberships found — keeping local data');
        setLoading(false);
        return;
      }

      // Fetch organizations
      const organizations = await fetchOrganizations(orgIds);

      // Set activeOrgId to first org if not already set
      const store = useEventStore.getState();
      const activeOrgId = store.activeOrgId || organizations[0]?.id || null;

      // For each org, fetch events, guests, and relationship groups in parallel
      const perOrgResults = await Promise.all(
        organizations.map((org) =>
          Promise.all([
            fetchEvents(org.id),
            fetchGuests(org.id),
            fetchRelationshipGroups(org.id),
          ])
        )
      );

      const events = perOrgResults.flatMap(([e]) => e);
      const guests = perOrgResults.flatMap(([, g]) => g);
      const relationshipGroups = perOrgResults.flatMap(([, , rg]) => rg);

      // Collect all event IDs and fetch event-level data in parallel
      const eventIds = events.map((e) => e.id);
      const [versions, seatingRules, collaborators] = await Promise.all([
        fetchVersions(eventIds),
        fetchSeatingRules(eventIds),
        fetchCollaborators(eventIds),
      ]);

      // Collect all version IDs and fetch version-level data in parallel
      const versionIds = versions.map((v) => v.id);
      const [layoutObjects, seatingAssignments] = await Promise.all([
        fetchLayoutObjects(versionIds),
        fetchSeatingAssignments(versionIds),
      ]);

      // Collect all group IDs and fetch relationship memberships
      const groupIds = relationshipGroups.map((rg) => rg.id);
      const relationshipMemberships =
        await fetchRelationshipMemberships(groupIds);

      // Hydrate the Zustand store — REPLACES all data with server truth
      useEventStore.setState({
        organizations,
        activeOrgId,
        events,
        guests,
        versions,
        layoutObjects,
        seatingAssignments,
        seatingRules,
        relationshipGroups,
        relationshipMemberships,
        collaborators,
        hasCompletedOnboarding: organizations.length > 0,
      });

      // Push org-level LLM config into the provider layer
      const activeOrg = organizations.find((o) => o.id === activeOrgId);
      setOrgLLMConfig(activeOrg?.llmConfig);

      console.log(
        `[supabase-sync] Loaded: ${organizations.length} org(s), ` +
        `${events.length} event(s), ${guests.length} guest(s), ` +
        `${layoutObjects.length} layout object(s), ${seatingAssignments.length} assignment(s)`,
      );

      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync data";
      console.error('[supabase-sync] Sync failed:', message);
      setError(message);
      setLoading(false);
    }
  }, []);

  return { syncAll, loading, error };
}
