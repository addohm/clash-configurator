<script lang="ts">
  import { DEFAULT_MODE, MODES, type Mode } from '../../core/src';
  import { strings as t } from './i18n';

  let mode: Mode = $state(DEFAULT_MODE);

  const hints: Record<Mode, string> = {
    simple: t.modes.simpleHint,
    advanced: t.modes.advancedHint,
    scratch: t.modes.scratchHint,
  };
</script>

<main>
  <header>
    <h1>{t.title}</h1>
    <p class="tagline">{t.tagline}</p>
    <p class="local">{t.local}</p>
  </header>

  <div class="modes" role="radiogroup" aria-label={t.modes.label}>
    {#each MODES as m (m)}
      <button
        type="button"
        role="radio"
        aria-checked={mode === m}
        class:active={mode === m}
        onclick={() => (mode = m)}
      >
        {t.modes[m]}
      </button>
    {/each}
  </div>
  <p class="hint">{hints[mode]}</p>

  <section class="card">
    <p>{t.firstBuild}</p>
  </section>
</main>

<style>
  main {
    max-width: 880px;
    margin: 0 auto;
    padding: 2rem 1.25rem 3rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.75rem;
    letter-spacing: -0.01em;
  }

  .tagline {
    margin: 0;
    color: var(--muted);
  }

  .local {
    margin: 0.25rem 0 1.5rem;
    font-size: 0.875rem;
    color: var(--accent);
  }

  .modes {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .modes button {
    border: 0;
    border-radius: calc(var(--radius) - 4px);
    padding: 0.4rem 1rem;
    font: inherit;
    color: var(--text);
    background: transparent;
    cursor: pointer;
  }

  .modes button.active {
    color: var(--accent-text);
    background: var(--accent);
  }

  .hint {
    margin: 0.5rem 0 1.5rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .card {
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .card p {
    margin: 0;
  }
</style>
