<script lang="ts">
  import { TARGET_APPS, type AppId } from '../../../core/src';
  import { strings as t } from '../i18n';
  import { store } from '../lib/store.svelte';

  const hints: Record<AppId, string> = {
    mihomo: t.apps.mihomoHint,
    stash: t.apps.stashHint,
    shadowrocket: t.apps.shadowrocketHint,
  };
</script>

<p class="intro">{t.pickApp.intro}</p>
<div class="apps" role="radiogroup" aria-label={t.steps.app}>
  {#each TARGET_APPS as app (app.id)}
    <button
      type="button"
      role="radio"
      aria-checked={store.app === app.id}
      class:active={store.app === app.id}
      onclick={() => store.pickApp(app.id)}
    >
      <strong>{t.apps[app.id]}</strong>
      <span>{hints[app.id]}</span>
    </button>
  {/each}
</div>

<style>
  .intro {
    margin: 0 0 0.75rem;
    color: var(--muted);
  }

  .apps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.5rem;
  }

  button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font: inherit;
    text-align: left;
    color: var(--text);
    background: var(--bg);
    cursor: pointer;
  }

  button:hover {
    border-color: var(--accent);
  }

  button.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  span {
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
