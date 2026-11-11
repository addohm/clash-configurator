<script lang="ts">
  import { MODES, type Mode } from '../../core/src';
  import { format, strings as t } from './i18n';
  import Step from './lib/Step.svelte';
  import { STEPS, type StepId, store } from './lib/store.svelte';
  import EditStep from './edit/EditStep.svelte';
  import BringConfig from './steps/BringConfig.svelte';
  import PickApp from './steps/PickApp.svelte';
  import Review from './steps/Review.svelte';
  import SafetyReport from './steps/SafetyReport.svelte';

  const hints: Record<Mode, string> = {
    simple: t.modes.simpleHint,
    advanced: t.modes.advancedHint,
    scratch: t.modes.scratchHint,
  };

  const stateOf = (id: StepId): 'open' | 'done' | 'later' => {
    if (store.step === id) return 'open';
    return STEPS.indexOf(id) <= store.reached ? 'done' : 'later';
  };

  const current = $derived(STEPS.indexOf(store.step) + 1);

  const counts = $derived.by(() => {
    const data = store.data;
    const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    return { servers: len(data['proxies']), groups: len(data['proxy-groups']), rules: len(data['rules']) };
  });

  const summaries = $derived({
    app: store.app ? format(t.pickApp.picked, { app: t.apps[store.app] }) : '',
    input:
      store.source?.kind === 'file'
        ? format(t.input.loaded, { name: store.source.name ?? '' })
        : store.source
          ? format(t.input.loaded, { name: t.input.pasted })
          : '',
    report: store.checked?.ok ? format(t.report.summary, {
      problems: store.checked.findings.filter((f) => f.severity !== 'info').length,
      notes: store.checked.findings.filter((f) => f.severity === 'info').length,
    }) : '',
    edit: '',
    review: '',
  });
</script>

<main>
  <header class="top">
    <h1>{t.title}</h1>
    <p class="tagline">{t.tagline}</p>
    <p class="local">{t.local}</p>
  </header>

  <div class="modes" role="radiogroup" aria-label={t.modes.label}>
    {#each MODES as m (m)}
      <button
        type="button"
        role="radio"
        aria-checked={store.mode === m}
        class:active={store.mode === m}
        onclick={() => (store.mode = m)}
      >
        {t.modes[m]}
      </button>
    {/each}
  </div>
  <p class="hint">{hints[store.mode]}</p>

  {#if store.mode !== 'simple'}
    <section class="card"><p>{t.notBuiltYet}</p></section>
  {:else}
    <div class="progress" aria-hidden="true">
      <div class="bar"><div class="fill fill-{current}"></div></div>
      <span>{format(t.steps.progress, { n: current, total: STEPS.length })}</span>
    </div>

    <ol class="steps">
      {#each STEPS as id, i (id)}
        <li>
          <Step n={i + 1} title={t.steps[id]} state={stateOf(id)} summary={summaries[id]} onopen={() => store.open(id)}>
            {#if id === 'app'}
              <PickApp />
            {:else if id === 'input'}
              <BringConfig />
            {:else if id === 'report'}
              <SafetyReport />
            {:else if id === 'edit'}
              <p>{format(t.edit.ready, counts)}</p>
              <EditStep />
            {:else}
              <Review />
            {/if}
          </Step>
        </li>
      {/each}
    </ol>
  {/if}
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
    background: transparent;
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

  .progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .bar {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }

  /* Widths as classes: the security policy allows no inline styles. */
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
  .fill-1 { width: 20%; }
  .fill-2 { width: 40%; }
  .fill-3 { width: 60%; }
  .fill-4 { width: 80%; }
  .fill-5 { width: 100%; }

  .steps {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .muted {
    color: var(--muted);
  }
</style>
