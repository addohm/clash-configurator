<!--
  Step 4: the config's parts as cards, one at a time (PLAN.md Q10, Q11),
  each showing what the config already has. Next moves on; the last one
  leads to the review.
-->
<script lang="ts">
  import { format, strings as t } from '../i18n';
  import { SECTIONS, store } from '../lib/store.svelte';
  import Basics from './Basics.svelte';
  import Dns from './Dns.svelte';
  import Groups from './Groups.svelte';
  import Rules from './Rules.svelte';
  import Servers from './Servers.svelte';

  const index = $derived(SECTIONS.indexOf(store.section));
  const last = $derived(index === SECTIONS.length - 1);

  function next() {
    const n = SECTIONS[index + 1];
    if (n) store.section = n;
    else store.advance('review');
  }
</script>

<nav class="parts" aria-label={t.steps.edit}>
  {#each SECTIONS as id (id)}
    <button type="button" class:active={store.section === id} aria-current={store.section === id ? 'true' : undefined} onclick={() => (store.section = id)}>
      {t.edit.sections[id]}
    </button>
  {/each}
</nav>

<div class="status">
  <span>{store.edits.length > 0 || (store.session?.changes.length ?? 0) > 0 ? format(t.edit.changes, { count: store.session?.changes.length ?? 0 }) : t.edit.noChanges}</span>
  <button type="button" class="link" disabled={store.edits.length === 0} onclick={() => store.undo()}>{t.edit.undo}</button>
</div>
{#if store.editError}
  <p class="error" role="alert">
    {format(t.edit.failed, { reason: t.editErrors[store.editError as keyof typeof t.editErrors] ?? store.editError })}
  </p>
{/if}

<section class="card" aria-label={t.edit.sections[store.section]}>
  <h3>{t.edit.sections[store.section]} <span class="of">{format(t.edit.sectionOf, { n: index + 1, total: SECTIONS.length })}</span></h3>
  {#if store.section === 'basics'}
    <Basics />
  {:else if store.section === 'servers'}
    <Servers />
  {:else if store.section === 'groups'}
    <Groups />
  {:else if store.section === 'rules'}
    <Rules />
  {:else}
    <Dns />
  {/if}
</section>

<div class="actions">
  {#if index > 0}
    <button type="button" onclick={() => (store.section = SECTIONS[index - 1] ?? 'basics')}>{t.edit.back}</button>
  {/if}
  <button type="button" class="primary" onclick={next}>{last ? t.edit.done : t.edit.next}</button>
</div>

<style>
  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .parts button {
    padding: 0.3rem 0.75rem;
    font-size: 0.875rem;
  }

  .parts button.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .link {
    border: 0;
    padding: 0;
    color: var(--accent);
    background: none;
  }

  .card {
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }

  h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .of {
    margin-left: 0.5rem;
    font-size: 0.8rem;
    font-weight: normal;
    color: var(--muted);
  }

  .error {
    color: var(--danger);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>
