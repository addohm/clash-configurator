<!--
  One numbered step of Simple mode: open (its content shows), done (a summary
  and a Change button), or not reached yet (dimmed).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { strings as t } from '../i18n';

  let {
    n,
    title,
    state,
    summary = '',
    onopen,
    children,
  }: {
    n: number;
    title: string;
    state: 'open' | 'done' | 'later';
    summary?: string;
    onopen: () => void;
    children: Snippet;
  } = $props();
</script>

<section class="step {state}" aria-current={state === 'open' ? 'step' : undefined}>
  <header>
    <span class="n" aria-hidden="true">{n}</span>
    <h2>{title}</h2>
    {#if state === 'done'}
      <button type="button" class="change" onclick={onopen}>{t.steps.change}</button>
    {/if}
  </header>
  {#if state === 'open'}
    <div class="body">{@render children()}</div>
  {:else if state === 'done' && summary}
    <p class="summary">{summary}</p>
  {/if}
</section>

<style>
  .step {
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .step.later {
    opacity: 0.5;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .n {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--muted);
    border: 1px solid var(--border);
  }

  .open .n {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .done .n {
    color: var(--accent);
    border-color: var(--accent);
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .change {
    margin-left: auto;
    border: 0;
    padding: 0.2rem 0.5rem;
    font: inherit;
    font-size: 0.875rem;
    color: var(--accent);
    background: none;
    cursor: pointer;
  }

  .summary {
    margin: 0.5rem 0 0 2.5rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .body {
    margin: 0.75rem 0 0 2.5rem;
  }

  @media (max-width: 560px) {
    .body,
    .summary {
      margin-left: 0;
    }
  }
</style>
