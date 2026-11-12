<!--
  Advanced mode (PLAN.md Q11, Q30, Q31): every part of the config on one
  page, no step-by-step guidance, with the expert settings shown. A bar at
  the top keeps the app, the change count, Undo and Review in reach; the
  sidebar jumps to each part. Lists keep their own scrolling panels, so the
  page stays manageable. Reviewing and saving is its own view, as in Simple
  mode, because writing a big config out takes a moment.
-->
<script lang="ts">
  import { TARGET_APPS, type AppId } from '../../../core/src';
  import Basics from '../edit/Basics.svelte';
  import Controller from '../edit/Controller.svelte';
  import Dns from '../edit/Dns.svelte';
  import Groups from '../edit/Groups.svelte';
  import Rules from '../edit/Rules.svelte';
  import Servers from '../edit/Servers.svelte';
  import Tun from '../edit/Tun.svelte';
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { inApp } from '../lib/save';
  import { ADVANCED_PARTS, store } from '../lib/store.svelte';
  import BringConfig from '../steps/BringConfig.svelte';
  import Review from '../steps/Review.svelte';
  import SafetyReport from '../steps/SafetyReport.svelte';

  const count = $derived(store.session?.changes.length ?? 0);
</script>

<div class="advanced-page">
  <header class="adv-bar">
    <label>
      <span>{t.advanced.forApp}</span>
      <select value={store.app ?? 'mihomo'} onchange={(e) => store.pickApp(e.currentTarget.value as AppId)}>
        {#each TARGET_APPS as a (a.id)}<option value={a.id}>{t.apps[a.id]}</option>{/each}
      </select>
    </label>
    {#if store.session}
      <span class="status">{count > 0 ? format(t.edit.changes, { count }) : t.edit.noChanges}</span>
      <button type="button" class="small" disabled={store.edits.length === 0} onclick={() => store.undo()}>{t.edit.undo}</button>
      {#if store.source?.kind === 'url' && !store.source.scratch && inApp()}
        <button type="button" class="small" disabled={store.fetchingUpdate} onclick={() => void store.startUpdate()}>
          {store.fetchingUpdate ? t.update.fetching : t.update.button}
        </button>
        <Info text={t.update.buttonInfo} />
      {/if}
      {#if store.step === 'review'}
        <button type="button" class="small" onclick={() => store.open('edit')}>{t.advanced.backToEditing}</button>
      {:else}
        <button type="button" class="primary small" onclick={() => store.advance('review')}>{t.steps.review}</button>
      {/if}
    {/if}
  </header>

  {#if store.editError}
    <p class="error" role="alert">
      {format(t.edit.failed, { reason: t.editErrors[store.editError as keyof typeof t.editErrors] ?? store.editError })}
    </p>
  {/if}

  <div class="page">
    {#if !store.session}
      <section id="adv-config" class="card">
        <h3>{t.steps.input}</h3>
        <BringConfig />
      </section>
      {#if store.checked}
        <section id="adv-report" class="card">
          <h3>{t.steps.report}</h3>
          <SafetyReport />
        </section>
      {/if}
    {:else if store.step === 'review'}
      <section id="adv-review" class="card review">
        <h3>{t.steps.review}</h3>
        <Review />
      </section>
    {:else}
      {#each ADVANCED_PARTS as part (part)}
        <section id={`adv-${part}`} class="card part" aria-label={t.edit.sections[part]}>
          <h3>{t.edit.sections[part]}</h3>
          {#if part === 'basics'}
            <Basics />
          {:else if part === 'servers'}
            <Servers />
          {:else if part === 'groups'}
            <Groups />
          {:else if part === 'rules'}
            <Rules />
          {:else if part === 'dns'}
            <Dns advanced />
          {:else if part === 'tun'}
            <Tun />
          {:else}
            <Controller />
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</div>

<style>
  .advanced-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .adv-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0.6rem;
  }

  .adv-bar label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }

  .adv-bar select {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
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

  .page {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scroll-behavior: smooth;
  }

  .card {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    scroll-margin-top: 0.5rem;
  }

  h3 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
  }

  /* On one long page, lists get a set height and scroll inside. */
  .page :global(.scroll-panel) {
    flex: none;
    height: auto;
    max-height: 24rem;
  }

  .page :global(.split) {
    height: 26rem;
  }

  .error {
    margin: 0 0 0.5rem;
    color: var(--danger);
  }

  @media (max-width: 760px) {
    .page {
      overflow: visible;
    }
  }
</style>
