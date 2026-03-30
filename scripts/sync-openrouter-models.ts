#!/usr/bin/env npx tsx
/**
 * Sync OpenRouter Models
 *
 * Fetches the latest models from OpenRouter's API and prints a
 * recommended update for src/services/llm-providers.ts.
 *
 * Usage:
 *   npx tsx scripts/sync-openrouter-models.ts
 *
 * What it does:
 * 1. Fetches https://openrouter.ai/api/v1/models
 * 2. Filters for models relevant to Franck (tool calling, chat, free)
 * 3. Prints a categorized model list you can paste into llm-providers.ts
 * 4. Highlights NEW models not currently in the codebase
 */

const CURRENT_MODELS = new Set([
  // Free
  'deepseek/deepseek-chat-v3.1:free',
  'meta-llama/llama-4-maverick:free',
  'qwen/qwen3-235b-a22b:free',
  'qwen/qwen3-coder:free',
  // Value
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'deepseek/deepseek-chat-v3.1',
  'anthropic/claude-haiku-4.5',
  // Premium
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
  'google/gemini-3-pro-preview',
  'openai/gpt-4.1',
  // Experimental
  'deepseek/deepseek-v3.2',
  'deepseek/deepseek-v3.2-speciale',
  'deepseek/deepseek-r1',
  'google/gemini-3-flash-preview',
]);

// Model families we care about for an event planning AI agent
const RELEVANT_PREFIXES = [
  'anthropic/claude',
  'openai/gpt',
  'google/gemini',
  'deepseek/',
  'meta-llama/',
  'qwen/',
  'mistralai/',
  'nvidia/',
  'x-ai/',
];

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  top_provider?: { max_completion_tokens?: number };
  architecture?: { modality?: string; tokenizer?: string };
}

async function main() {
  console.log('Fetching models from OpenRouter...\n');

  const response = await fetch('https://openrouter.ai/api/v1/models');
  if (!response.ok) {
    console.error(`Failed to fetch: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const data = (await response.json()) as { data: OpenRouterModel[] };
  const models = data.data;

  console.log(`Total models on OpenRouter: ${models.length}\n`);

  // Filter to relevant models
  const relevant = models.filter((m) =>
    RELEVANT_PREFIXES.some((p) => m.id.startsWith(p))
  );

  // Categorize
  const free = relevant.filter((m) => m.id.endsWith(':free'));
  const paid = relevant.filter((m) => !m.id.endsWith(':free'));

  // Sort by provider/name
  free.sort((a, b) => a.id.localeCompare(b.id));
  paid.sort((a, b) => a.id.localeCompare(b.id));

  // High-performance free models (good for Franck)
  console.log('═══════════════════════════════════════════════════');
  console.log('  🆓 FREE MODELS (tool calling candidates)');
  console.log('═══════════════════════════════════════════════════');
  for (const m of free) {
    const isNew = !CURRENT_MODELS.has(m.id);
    const tag = isNew ? ' ← 🆕 NEW!' : '';
    console.log(`  ${m.id}${tag}`);
    console.log(`    ${m.name} | ctx: ${(m.context_length / 1000).toFixed(0)}k`);
  }

  // Paid models worth considering
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  💰 PAID MODELS (by family)');
  console.log('═══════════════════════════════════════════════════');

  const families = new Map<string, OpenRouterModel[]>();
  for (const m of paid) {
    const family = m.id.split('/')[0];
    if (!families.has(family)) families.set(family, []);
    families.get(family)!.push(m);
  }

  for (const [family, models] of families) {
    console.log(`\n  ── ${family} ──`);
    for (const m of models) {
      const promptCost = parseFloat(m.pricing.prompt) * 1_000_000;
      const isNew = !CURRENT_MODELS.has(m.id);
      const tag = isNew ? ' ← 🆕 NEW!' : ' ✓';
      console.log(
        `  ${m.id}${tag}` +
        `\n    ${m.name} | $${promptCost.toFixed(2)}/M in | ctx: ${(m.context_length / 1000).toFixed(0)}k`
      );
    }
  }

  // Summary of new models
  const allIds = new Set(relevant.map((m) => m.id));
  const newModels = relevant.filter((m) => !CURRENT_MODELS.has(m.id));
  const removedModels = [...CURRENT_MODELS].filter((id) => !allIds.has(id));

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Current in codebase: ${CURRENT_MODELS.size}`);
  console.log(`  Available on OpenRouter: ${relevant.length}`);
  console.log(`  New models to consider: ${newModels.length}`);
  console.log(`  Removed/renamed (may need update): ${removedModels.length}`);

  if (removedModels.length > 0) {
    console.log('\n  ⚠️  MODELS IN CODE BUT NOT ON OPENROUTER:');
    for (const id of removedModels) {
      console.log(`    ❌ ${id}`);
    }
  }

  if (newModels.length > 0) {
    console.log('\n  🆕 NOTABLE NEW MODELS:');
    const notable = newModels.filter((m) => {
      const id = m.id.toLowerCase();
      // Highlight free models, or models from top providers
      return (
        m.id.endsWith(':free') ||
        id.includes('claude') ||
        id.includes('gpt') ||
        id.includes('gemini-3') ||
        id.includes('deepseek-v3.2') ||
        id.includes('deepseek-v4') ||
        id.includes('llama-4') ||
        id.includes('llama-5')
      );
    });
    for (const m of notable.slice(0, 20)) {
      const isFree = m.id.endsWith(':free');
      const promptCost = parseFloat(m.pricing.prompt) * 1_000_000;
      console.log(
        `    ${isFree ? '🆓' : '💰'} ${m.id}` +
        `\n       ${m.name} | ${isFree ? 'FREE' : `$${promptCost.toFixed(2)}/M in`} | ctx: ${(m.context_length / 1000).toFixed(0)}k`
      );
    }
  }

  console.log('\n✅ Done. Update CURRENT_MODELS in this script after applying changes.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
