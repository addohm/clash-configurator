<!--
  "Not used by Stash": shown next to settings the chosen app's file leaves
  out (PLAN.md Q7). They can still be edited: they stay in the settings file,
  for mihomo apps. `part` shows it as a note over a whole part instead.
-->
<script lang="ts">
  import { unusedBy } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import Info from './Info.svelte';
  import { store } from './store.svelte';

  let { keys, part = false }: { keys: string[]; part?: boolean } = $props();
  const app = $derived(store.app && keys.every((k) => unusedBy(store.app, k)) ? t.apps[store.app] : '');
</script>

{#if app && part}
  <p class="unused-note">{format(t.unused.part, { app })}</p>
{:else if app}
  <span class="unused-tag">{format(t.unused.tag, { app })} <Info text={format(t.unused.info, { app })} /></span>
{/if}

<style>
  .unused-tag {
    display: inline-flex;
    align-items: center;
    padding: 0 0.4rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--muted);
    background: var(--bg);
  }

  .unused-note {
    margin: 0 0 0.75rem;
    padding: 0.4rem 0.75rem;
    border-left: 4px solid var(--border);
    border-radius: 4px;
    font-size: 0.9rem;
    color: var(--muted);
    background: var(--bg);
  }
</style>
