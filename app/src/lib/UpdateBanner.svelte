<!--
  "Version 0.2.0 is out" at the top of the window, after the start-up check
  (PLAN.md Q20). Nothing is downloaded until Update and restart.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { format, strings as t } from '../i18n';
  import { type Available, checkForUpdate, installUpdate } from './updates';

  let available = $state<Available | null>(null);
  let installing = $state(false);
  let error = $state('');
  let dismissed = $state(false);

  onMount(() => {
    void checkForUpdate().then((a) => (available = a));
  });

  async function install() {
    installing = true;
    error = '';
    const why = await installUpdate();
    installing = false;
    if (why) error = format(t.updates.failed, { reason: why });
  }
</script>

{#if available && !dismissed}
  <section class="update" aria-label={t.updates.label}>
    <p>
      <strong>{format(t.updates.available, { version: available.version })}</strong>
      {#if installing}{t.updates.installing}{:else}{t.updates.what}{/if}
    </p>
    {#if available.notes}
      <details>
        <summary>{t.updates.notes}</summary>
        <pre>{available.notes}</pre>
      </details>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row">
      <button type="button" class="primary" disabled={installing} onclick={install}>{t.updates.install}</button>
      <button type="button" disabled={installing} onclick={() => (dismissed = true)}>{t.updates.later}</button>
    </div>
  </section>
{/if}

<style>
  .update {
    margin-bottom: 0.75rem;
    padding: 0.6rem 0.9rem;
    border-left: 4px solid var(--accent);
    border-radius: 6px;
    background: var(--surface);
  }

  p {
    margin: 0 0 0.4rem;
  }

  pre {
    max-height: 10rem;
    overflow: auto;
    white-space: pre-wrap;
    font-size: 0.85rem;
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  .error {
    color: var(--danger);
  }
</style>
