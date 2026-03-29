/**
 * Franck Fallback Responses — Context-Aware Response Library
 *
 * Provides intelligent fallback responses when the LLM is unavailable,
 * unconfigured, or returns unusable results. All responses are written
 * in Franck's dramatic, passionate voice with occasional French flair.
 *
 * This module intentionally avoids importing from franck-agent.ts,
 * franck-tools.ts, or franck-workflows.ts to prevent circular deps.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Recognized user intents that Franck can respond to without an LLM.
 * This mirrors what a future franck-intent.ts classifier would produce.
 */
export type FranckIntent =
  | 'event_status'
  | 'guest_list'
  | 'seat_guests'
  | 'optimize'
  | 'move_guest'
  | 'swap_guests'
  | 'unseat_guest'
  | 'general_question'
  | 'unknown';

/** Summary of event data for generating contextual responses */
export interface EventContextSummary {
  eventName: string;
  guestCount: number;
  confirmedCount: number;
  pendingCount: number;
  tableCount: number;
  seatedCount: number;
  unseatedCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a random element from an array */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Response Templates
// ---------------------------------------------------------------------------

type TemplateFunction = (
  ctx: EventContextSummary | null,
  params: Record<string, string>,
) => string;

const EVENT_STATUS_TEMPLATES: TemplateFunction[] = [
  (ctx) => {
    if (!ctx) return "Mon dieu, Franck cannot find the event details right now! Try the **\"event readiness check\"** command -- it works like magic, no API key needed.";
    return `Ah, your event **"${ctx.eventName}"** -- quelle splendeur! You have **${ctx.guestCount}** guests total, **${ctx.confirmedCount}** confirmed, and **${ctx.pendingCount}** still making Franck wait (the suspense, it is unbearable!). Currently **${ctx.seatedCount}** are seated across **${ctx.tableCount}** tables.`;
  },
  (ctx) => {
    if (!ctx) return "Franck is momentarily without his spectacles! Type **\"event status\"** or **\"how is the event\"** to trigger the instant status workflow.";
    return `C'est parfait -- let Franck give you the overview of **"${ctx.eventName}"**! We have **${ctx.guestCount}** guests on the list. Of those, **${ctx.confirmedCount}** have confirmed (magnifique!), **${ctx.pendingCount}** are still pending. On the seating front: **${ctx.seatedCount}** seated, **${ctx.unseatedCount}** floating like lost souls across **${ctx.tableCount}** tables.`;
  },
  (ctx) => {
    if (!ctx) return "Ah, the event data eludes Franck at this moment! Use the **\"event readiness check\"** quick action -- it gathers everything instantly.";
    const seatingPct = ctx.guestCount > 0 ? Math.round((ctx.seatedCount / ctx.guestCount) * 100) : 0;
    return `Incroyable! **"${ctx.eventName}"** is ${seatingPct >= 80 ? 'looking formidable' : seatingPct >= 50 ? 'taking shape beautifully' : 'still in its early masterpiece phase'}. The numbers: **${ctx.guestCount}** guests, **${ctx.confirmedCount}** confirmed, **${ctx.pendingCount}** pending. Seating is at **${seatingPct}%** -- ${ctx.seatedCount} seated across ${ctx.tableCount} tables, ${ctx.unseatedCount} still need their place in the choreography.`;
  },
];

const GUEST_LIST_TEMPLATES: TemplateFunction[] = [
  (ctx) => {
    if (!ctx) return "Franck cannot pull the guest list without event data, mon ami. Try typing **\"guest list audit\"** -- it runs instantly!";
    return `The guest list for **"${ctx.eventName}"** -- every name is a brushstroke on Franck's canvas! You have **${ctx.guestCount}** guests total: **${ctx.confirmedCount}** confirmed (these are Franck's favorites, so reliable!), and **${ctx.pendingCount}** still undecided. For the full breakdown, try the **\"guest list audit\"** command.`;
  },
  (ctx) => {
    if (!ctx) return "Without the event loaded, Franck is like a conductor without an orchestra! Type **\"show me the guests\"** to trigger the guest audit workflow.";
    return `Ah, the guest list! **${ctx.guestCount}** beautiful souls have been invited to **"${ctx.eventName}"**. The confirmed count stands at **${ctx.confirmedCount}** -- c'est magnifique! We still await word from **${ctx.pendingCount}** guests. Shall Franck suggest sending them a reminder? Type **\"guest list audit\"** for the full analysis!`;
  },
  (ctx) => {
    if (!ctx) return "Mon dieu, Franck needs event context to discuss the guest list! Use the **\"who is coming\"** command for instant results.";
    return `Let Franck paint the picture of your guest list! **"${ctx.eventName}"** has **${ctx.guestCount}** guests. The breakdown: **${ctx.confirmedCount}** confirmed, **${ctx.pendingCount}** pending -- and **${ctx.seatedCount}** already have their perfect seats assigned. For a detailed audit, say **\"guest list audit\"**.`;
  },
];

const SEAT_GUESTS_TEMPLATES: TemplateFunction[] = [
  (ctx) => {
    const unseated = ctx ? ` You have **${ctx.unseatedCount}** guests waiting for their seats!` : '';
    return `Ah, the art of seating -- Franck's greatest passion!${unseated} To auto-seat everyone, simply type **"auto seat"** or click the **Auto-Seat Guests** quick action. Franck's algorithm will arrange everything with the precision of a Swiss watch and the artistry of a Parisian couturier!`;
  },
  (ctx) => {
    const unseated = ctx ? ` Currently **${ctx.unseatedCount}** guests are without seats -- quelle catastrophe!` : '';
    return `Mon ami, seating is not mere logistics -- it is the choreography of human connection!${unseated} Type **"seat everyone"** or use the **Auto-Seat Guests** button, and Franck's intelligent algorithm will handle the rest. It respects relationship groups, dietary needs, and all the little details that make an event extraordinary.`;
  },
  (ctx) => {
    const unseated = ctx ? ` There are **${ctx.unseatedCount}** unassigned guests across **${ctx.tableCount}** tables.` : '';
    return `Franck lives for this moment!${unseated} To seat everyone automatically, say **"auto seat"** or **"fill the tables"**. For a complete fresh start, try **"full seating setup"** -- it clears everything and rebuilds from scratch. Perfection takes courage, non?`;
  },
];

const OPTIMIZE_TEMPLATES: TemplateFunction[] = [
  (ctx) => {
    const info = ctx ? ` with **${ctx.seatedCount}** guests across **${ctx.tableCount}** tables` : '';
    return `Optimization -- now Franck is truly in his element! Your current arrangement${info} can always be refined. Click the **Auto-Pilot** button or type **"optimize seating"** to run Franck's refinement loop. It scores, swaps, and perfects until the arrangement is *chef's kiss*!`;
  },
  (ctx) => {
    const info = ctx ? ` Currently **${ctx.seatedCount}** seated across **${ctx.tableCount}** tables -- ` : '';
    return `Ah, you want perfection? Franck approves! ${info}Type **"quick optimization"** or **"refine seating"** to launch the optimization engine. It will analyze every table, test dozens of swaps, and find the arrangement that maximizes harmony. C'est magnifique when the algorithm does its dance!`;
  },
  (ctx) => {
    const info = ctx ? ` We have **${ctx.seatedCount}** guests seated -- ` : '';
    return `Franck does not do mediocre, and neither should your seating!${info ? ` ${info}` : ' '}Say **"optimize"** or click **Auto-Pilot** to unleash the refinement loop. It will iterate, score, and swap until every guest is exactly where they should be. The choreography of human connection, perfected!`;
  },
];

const MOVE_GUEST_TEMPLATES: TemplateFunction[] = [
  (_ctx, params) => {
    const guest = params.guestName ? ` **${params.guestName}**` : ' a guest';
    return `Ah, you wish to move${guest}! Franck understands the delicacy of such a decision. To move a guest, phrase it like: **"move Sarah to Table 5"** or **"put John at Table 3"**. Franck's workflow engine will find the guest and place them with precision. Every seat tells a story, non?`;
  },
  (_ctx, params) => {
    const guest = params.guestName ? ` ${params.guestName}` : ' someone';
    return `Moving${guest} -- this is the art of fine-tuning! Tell Franck exactly what you need, like **"move [name] to Table [number]"**. The workflow system handles the lookup and placement automatically. No API key needed for this magic!`;
  },
];

const SWAP_GUESTS_TEMPLATES: TemplateFunction[] = [
  () => {
    return `A swap! Franck loves a good dramatic reshuffling! To swap two guests, say something like **"swap Sarah and John"** or **"switch the seats of Alice and Bob"**. Franck's chain engine will find both guests and execute the swap in one elegant motion. C'est parfait!`;
  },
  () => {
    return `Ah, the delicate dance of the swap! Tell Franck which two guests should trade places -- for example, **"swap [name1] and [name2]"**. The system will handle it automatically, like two dancers exchanging positions mid-waltz. Magnifique!`;
  },
];

const UNSEAT_GUEST_TEMPLATES: TemplateFunction[] = [
  (_ctx, params) => {
    const guest = params.guestName ? ` **${params.guestName}**` : ' a guest';
    return `You want to unseat${guest}? Sometimes starting fresh is the path to perfection! Say **"unseat [name]"** or **"remove [name] from their table"**. To clear ALL seating and start over entirely, try **"clear and reseat"** -- Franck will rebuild everything from zero!`;
  },
  () => {
    return `Removing a seating assignment -- sometimes you must destroy to create, non? Tell Franck who to unseat: **"unseat [name]"**. Or if you want a clean slate, say **"start fresh"** to clear everything and begin the masterpiece anew!`;
  },
];

const GENERAL_TEMPLATES: TemplateFunction[] = [
  (ctx) => {
    const eventInfo = ctx ? `I see you're working on **"${ctx.eventName}"** -- magnifique! ` : '';
    return `Bonjour, mon ami! ${eventInfo}Franck is here to orchestrate the event of the century! Here is what I can do for you:\n\n` +
      `- **"event status"** or **"how is the event"** -- full event overview\n` +
      `- **"auto seat"** or **"seat everyone"** -- intelligent auto-seating\n` +
      `- **"optimize"** or **"refine seating"** -- optimize the current arrangement\n` +
      `- **"move [name] to Table [number]"** -- move a specific guest\n` +
      `- **"swap [name1] and [name2]"** -- swap two guests\n` +
      `- **"guest list audit"** -- full guest list analysis\n` +
      `- **"full seating setup"** -- clear and redo all seating\n\n` +
      `These commands work instantly -- no API key required! For freeform conversation, configure an API key in the settings.`;
  },
  (ctx) => {
    const eventInfo = ctx ? `Working on **"${ctx.eventName}"** with **${ctx.guestCount}** guests -- Franck is thrilled! ` : '';
    return `Ah, you need Franck's guidance! ${eventInfo}Here are Franck's specialties:\n\n` +
      `- **Event overview:** say **"event readiness check"**\n` +
      `- **Seating:** say **"auto seat"**, **"optimize"**, or **"full seating setup"**\n` +
      `- **Guest management:** say **"guest list audit"** or **"who is coming"**\n` +
      `- **Move guests:** say **"move [name] to Table [number]"**\n` +
      `- **Swap guests:** say **"swap [name1] and [name2]"**\n\n` +
      `Franck does not do mediocre -- every command is executed with passion and precision!`;
  },
  (ctx) => {
    const eventInfo = ctx ? `I am at your service for **"${ctx.eventName}"**! ` : '';
    return `Mon ami! ${eventInfo}Franck can help with many things:\n\n` +
      `- **"how is the event"** -- instant status report\n` +
      `- **"seat everyone"** -- auto-seat all unassigned guests\n` +
      `- **"quick optimization"** -- refine the current seating\n` +
      `- **"guest list audit"** -- analyze the guest list\n` +
      `- **"move [name] to Table [N]"** -- relocate a guest\n` +
      `- **"swap [name1] and [name2]"** -- exchange two guests\n\n` +
      `All of these work without an API key! For creative questions and freeform chat, add your API key in settings. Allez!`;
  },
];

const RESPONSE_MAP: Record<FranckIntent, TemplateFunction[]> = {
  event_status: EVENT_STATUS_TEMPLATES,
  guest_list: GUEST_LIST_TEMPLATES,
  seat_guests: SEAT_GUESTS_TEMPLATES,
  optimize: OPTIMIZE_TEMPLATES,
  move_guest: MOVE_GUEST_TEMPLATES,
  swap_guests: SWAP_GUESTS_TEMPLATES,
  unseat_guest: UNSEAT_GUEST_TEMPLATES,
  general_question: GENERAL_TEMPLATES,
  unknown: GENERAL_TEMPLATES,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a context-aware fallback response based on intent and event data.
 *
 * Used when:
 * 1. No API key is configured
 * 2. The LLM API call fails
 * 3. The free model gives a useless response
 * 4. The model doesn't support tool use
 */
export function generateFallbackResponse(
  intent: FranckIntent,
  eventContext: EventContextSummary | null,
  extractedParams: Record<string, string>,
): string {
  const templates = RESPONSE_MAP[intent] ?? GENERAL_TEMPLATES;
  const template = pick(templates);
  return template(eventContext, extractedParams);
}

/**
 * Extract event context summary from store state.
 *
 * Reads guests, layout objects, seating assignments, and event data
 * from the Zustand store snapshot to build a summary object.
 */
export function extractEventContext(
  storeState: any,
  eventId: string,
): EventContextSummary | null {
  try {
    const events = storeState.events ?? [];
    const event = events.find((e: any) => e.id === eventId);
    if (!event) return null;

    const guests = (storeState.guests ?? []).filter(
      (g: any) => g.eventId === eventId,
    );
    const confirmedCount = guests.filter(
      (g: any) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in',
    ).length;
    const pendingCount = guests.filter(
      (g: any) => g.rsvpStatus === 'invited' || g.rsvpStatus === 'waitlist',
    ).length;

    const activeVersionId = event.activeVersionId;
    const layoutObjects = (storeState.layoutObjects ?? []).filter(
      (lo: any) =>
        lo.versionId === activeVersionId &&
        (lo.type === 'round_table' || lo.type === 'rect_table'),
    );
    const tableCount = layoutObjects.length;

    const seatingAssignments = (storeState.seatingAssignments ?? []).filter(
      (sa: any) => sa.versionId === activeVersionId,
    );
    const seatedGuestIds = new Set(seatingAssignments.map((sa: any) => sa.guestId));
    const seatedCount = guests.filter((g: any) => seatedGuestIds.has(g.id)).length;
    const unseatedCount = guests.length - seatedCount;

    return {
      eventName: event.name,
      guestCount: guests.length,
      confirmedCount,
      pendingCount,
      tableCount,
      seatedCount,
      unseatedCount,
    };
  } catch {
    return null;
  }
}

/**
 * Get a list of suggested actions based on event state.
 *
 * Returns 3-5 context-aware suggestions that can be displayed
 * as quick-action chips in the UI.
 */
export function getSuggestedActions(
  context: EventContextSummary | null,
): string[] {
  if (!context) {
    return [
      'Check event status',
      'Auto-seat all guests',
      'Run guest list audit',
    ];
  }

  const suggestions: string[] = [];

  // Always suggest status check
  suggestions.push(`Check status of "${context.eventName}"`);

  // Unseated guests
  if (context.unseatedCount > 0) {
    suggestions.push(
      `Auto-seat ${context.unseatedCount} unassigned guest${context.unseatedCount === 1 ? '' : 's'}`,
    );
  }

  // Pending RSVPs
  if (context.pendingCount > 0) {
    suggestions.push(
      `Check on ${context.pendingCount} pending RSVP${context.pendingCount === 1 ? '' : 's'}`,
    );
  }

  // Optimization (only if guests are seated)
  if (context.seatedCount > 0) {
    suggestions.push('Optimize current seating arrangement');
  }

  // Full seating setup if many unseated
  if (context.unseatedCount > 5 && context.tableCount > 0) {
    suggestions.push('Run full seating setup from scratch');
  }

  // Guest list audit if many guests
  if (context.guestCount > 10) {
    suggestions.push('Run guest list audit');
  }

  // Cap at 5 suggestions
  return suggestions.slice(0, 5);
}
