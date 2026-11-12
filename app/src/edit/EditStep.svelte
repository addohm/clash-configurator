<!--
  Step 4: one part of the config at a time (PLAN.md Q10, Q30), chosen in the
  sidebar. The part fills the window: its title, Undo and the count of
  changes at the top, Back and Next at the bottom, and its lists scroll in
  their own panels in between.
-->
<script lang="ts">
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { inApp } from '../lib/save';
  import { SECTIONS, store } from '../lib/store.svelte';
  import Basics from './Basics.svelte';
  import Dns from './Dns.svelte';
  import Groups from './Groups.svelte';
  import Rules from './Rules.svelte';
  import Servers from './Servers.svelte';

  const index = $derived(SECTIONS.indexOf(store.section));
  const last = $derived(index === SECTIONS.length - 1);
  const count = $derived(store.session?.changes.length ?? 0);

  function next() {
    const n = SECTIONS[index + 1];
    if (n) store.section = n;
    else store.advance('review');
  }
</script>

<div class="frame">
  <header class="bar">
    <h3>
      {t.edit.sections[store.section]}
      <span class="of">{format(t.edit.sectionOf, { n: index + 1, total: SECTIONS.length })}</span>
    </h3>
    <span class="status">{count > 0 ? format(t.edit.changes, { count }) : t.edit.noChanges}</span>
    <button type="button" class="small" disabled={store.edits.length === 0} onclick={() => store.undo()}>{t.edit.undo}</button>
    {#if store.source?.kind === 'url' && inApp()}
      <span class="update">
        <button type="button" class="small" disabled={store.fetchingUpdate} onclick={() => void store.startUpdate()}>
          {store.fetchingUpdate ? t.update.fetching : t.update.button}
        </button>
        <Info text={t.update.buttonInfo} />
      </span>
    {/if}
  </header>

  <!-- Narrow windows hide the sidebar's parts list; these take its place. -->
  <nav class="parts" aria-label={t.steps.edit}>
    {#each SECTIONS as id (id)}
      <button type="button" class:active={store.section === id} aria-current={store.section === id ? 'true' : undefined} onclick={() => (store.section = id)}>
        {t.edit.sections[id]}
      </button>
    {/each}
  </nav>

  {#if store.editError}
    <p class="error" role="alert">
      {format(t.edit.failed, { reason: t.editErrors[store.editError as keyof typeof t.editErrors] ?? store.editError })}
    </p>
  {/if}

  <section class="card part" aria-label={t.edit.sections[store.section]}>
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

  <footer class="actions">
    {#if index > 0}
      <button type="button" onclick={() => (store.section = SECTIONS[index - 1] ?? 'basics')}>{t.edit.back}</button>
    {/if}
    <button type="button" class="primary" onclick={next}>{last ? t.edit.done : t.edit.next}</button>
  </footer>
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-bottom: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .of {
    margin-left: 0.4rem;
    font-size: 0.78rem;
    font-weight: normal;
    color: var(--muted);
  }

  .status {
    margin-left: auto;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .small {
    padding: 0.25rem 0.6rem;
    font-size: 0.85rem;
  }

  .update {
    display: inline-flex;
    align-items: center;
  }

  .parts {
    display: none;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .parts button {
    padding: 0.3rem 0.7rem;
    font-size: 0.85rem;
  }

  .parts button.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .part {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .error {
    margin: 0 0 0.5rem;
    color: var(--danger);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.6rem;
  }

  @media (max-width: 760px) {
    .parts {
      display: flex;
    }

    .part {
      overflow: visible;
    }
  }
</style>
