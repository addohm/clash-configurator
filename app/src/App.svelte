<!--
  The app's frame (PLAN.md Q30): a sidebar with the steps and the edit
  parts, and the open step filling the rest of the window. Long lists
  scroll inside their own panels, not the whole page. Narrow windows stack
  the sidebar on top.
-->
<script lang="ts">
  import { MODES, type Mode } from '../../core/src';
  import EditStep from './edit/EditStep.svelte';
  import { format, strings as t } from './i18n';
  import Info from './lib/Info.svelte';
  import { SECTIONS, STEPS, store } from './lib/store.svelte';
  import BringConfig from './steps/BringConfig.svelte';
  import PickApp from './steps/PickApp.svelte';
  import Review from './steps/Review.svelte';
  import SafetyReport from './steps/SafetyReport.svelte';

  const hints: Record<Mode, string> = {
    simple: t.modes.simpleHint,
    advanced: t.modes.advancedHint,
    scratch: t.modes.scratchHint,
  };

  const current = $derived(STEPS.indexOf(store.step) + 1);

  let resumeError = $state('');
  let forgotten = $state(false);

  function carryOn() {
    const r = store.resume();
    resumeError = r.ok ? '' : format(t.resume.failed, { reason: format(t.settingsErrors[r.error], { detail: r.detail ?? '' }) });
  }

  const counts = $derived.by(() => {
    const data = store.data;
    const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    return { servers: len(data['proxies']), groups: len(data['proxy-groups']), rules: len(data['rules']) };
  });

  /** One line under each finished step in the sidebar. */
  const summaries = $derived({
    app: store.app ? t.apps[store.app] : '',
    input:
      store.source?.kind === 'file'
        ? (store.source.name ?? '')
        : store.source?.kind === 'url'
          ? (store.source.name ?? t.input.fetched)
          : store.source
            ? t.input.pasted
            : '',
    report: store.checked?.ok
      ? format(t.report.summary, {
          problems: store.checked.findings.filter((f) => f.severity !== 'info').length,
          notes: store.checked.findings.filter((f) => f.severity === 'info').length,
        })
      : '',
    edit: store.session ? format(t.edit.changes, { count: store.session.changes.length }) : '',
    review: '',
  });

  const editReached = $derived(store.reached >= STEPS.indexOf('edit') && store.session !== null);
</script>

<div class="shell">
  <aside class="sidebar">
    <header>
      <h1>{t.title}</h1>
      <p class="local">{t.local}</p>
    </header>

    <div class="modes" role="radiogroup" aria-label={t.modes.label}>
      {#each MODES as m (m)}
        <button type="button" role="radio" aria-checked={store.mode === m} class:active={store.mode === m} onclick={() => (store.mode = m)}>
          {t.modes[m]}
        </button>
      {/each}
    </div>
    <p class="hint">{hints[store.mode]}</p>

    {#if store.mode === 'simple'}
      <nav aria-label={t.steps.label}>
        <div class="progress" aria-hidden="true">
          <div class="bar"><div class="fill fill-{current}"></div></div>
          <span>{format(t.steps.progress, { n: current, total: STEPS.length })}</span>
        </div>
        <ol class="steps">
          {#each STEPS as id, i (id)}
            <li>
              <button
                type="button"
                class="step-link"
                class:active={store.step === id}
                class:done={i < store.reached || (i <= store.reached && store.step !== id)}
                disabled={i > store.reached}
                aria-current={store.step === id ? 'step' : undefined}
                onclick={() => store.open(id)}
              >
                <span class="n" aria-hidden="true">{i + 1}</span>
                <span class="name">{t.steps[id]}</span>
              </button>
              {#if summaries[id] && store.step !== id}<p class="sum">{summaries[id]}</p>{/if}
              {#if id === 'edit' && editReached}
                <ul class="parts">
                  {#each SECTIONS as s (s)}
                    <li>
                      <button
                        type="button"
                        class:active={store.step === 'edit' && store.section === s}
                        aria-current={store.step === 'edit' && store.section === s ? 'page' : undefined}
                        onclick={() => {
                          store.open('edit');
                          store.section = s;
                        }}>{t.edit.sections[s]}</button
                      >
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ol>
      </nav>
    {/if}

    <footer>
      <button
        type="button"
        class="text-button"
        onclick={() => {
          store.forgetAll();
          forgotten = true;
        }}>{t.memory.forget}</button
      >
      <Info text={t.memory.forgetInfo} />
      {#if forgotten}<p class="hint" role="status">{t.memory.forgotten}</p>{/if}
    </footer>
  </aside>

  <main class="content">
    {#if store.mode !== 'simple'}
      <section class="view"><p>{t.notBuiltYet}</p></section>
    {:else}
      {#if store.resumable && !store.session}
        <section class="resume" aria-label={t.resume.title}>
          <p>
            <strong>{t.resume.title}</strong>
            {format(t.resume.what, {
              name: store.resumable.name || t.resume.unnamed,
              when: store.resumable.when ? store.resumable.when.toLocaleString() : '',
            })}
          </p>
          <div class="row">
            <button type="button" class="primary" onclick={carryOn}>{t.resume.carryOn}</button>
            <button type="button" onclick={() => store.startFresh()}>{t.resume.fresh}</button>
          </div>
        </section>
      {/if}
      {#if resumeError}<p class="error" role="alert">{resumeError}</p>{/if}
      {#if store.memoryFull}<p class="hint">{t.memory.tooBig}</p>{/if}

      <section class="view" class:edit={store.step === 'edit'} aria-labelledby="step-title">
        <h2 id="step-title">
          <span class="n" aria-hidden="true">{current}</span>
          {t.steps[store.step]}
        </h2>
        {#if store.step === 'app'}
          <PickApp />
        {:else if store.step === 'input'}
          <BringConfig />
        {:else if store.step === 'report'}
          <SafetyReport />
        {:else if store.step === 'edit'}
          <p class="ready">{format(t.edit.ready, counts)}</p>
          <EditStep />
        {:else}
          <Review />
        {/if}
      </section>
    {/if}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    height: 100vh;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0.75rem;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }

  h1 {
    margin: 0;
    font-size: 1.15rem;
    letter-spacing: -0.01em;
  }

  .local {
    margin: 0.15rem 0 0;
    font-size: 0.75rem;
    color: var(--accent);
  }

  .modes {
    display: flex;
    gap: 0.2rem;
    padding: 0.2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .modes button {
    flex: 1;
    border: 0;
    border-radius: calc(var(--radius) - 4px);
    padding: 0.3rem 0.2rem;
    font-size: 0.8rem;
    background: transparent;
  }

  .modes button.active {
    color: var(--accent-text);
    background: var(--accent);
  }

  .hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
    font-size: 0.72rem;
    color: var(--muted);
  }

  .bar {
    flex: 1;
    height: 5px;
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

  .steps,
  .parts {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    border: 0;
    padding: 0.4rem 0.35rem;
    text-align: left;
    background: transparent;
  }

  .step-link.active {
    background: var(--bg);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .step-link:disabled {
    opacity: 0.45;
  }

  .n {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 1.4rem;
    height: 1.4rem;
    border: 1px solid var(--border);
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
  }

  .active .n {
    border-color: var(--accent);
    color: var(--accent-text);
    background: var(--accent);
  }

  .done .n {
    border-color: var(--accent);
    color: var(--accent);
  }

  .name {
    font-size: 0.9rem;
  }

  .sum {
    margin: -0.2rem 0 0.3rem 2.25rem;
    font-size: 0.72rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .parts {
    margin: 0 0 0.25rem 1.6rem;
    border-left: 1px solid var(--border);
  }

  .parts button {
    display: block;
    width: 100%;
    border: 0;
    border-radius: 0;
    padding: 0.25rem 0.6rem;
    font-size: 0.85rem;
    text-align: left;
    color: var(--muted);
    background: transparent;
  }

  .parts button.active {
    color: var(--accent);
    font-weight: 600;
    box-shadow: inset 2px 0 0 var(--accent);
  }

  footer {
    margin-top: auto;
    padding-top: 1rem;
    font-size: 0.78rem;
  }

  .text-button {
    border: 0;
    padding: 0;
    color: var(--muted);
    background: none;
    text-decoration: underline;
    font-size: 0.78rem;
  }

  .content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 1rem 1.25rem;
    overflow: hidden;
  }

  .view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* The edit step manages its own scrolling: its lists fill the window. */
  .view.edit {
    overflow: hidden;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0 0 0.75rem;
    font-size: 1.2rem;
  }

  h2 .n {
    border-color: var(--accent);
    color: var(--accent-text);
    background: var(--accent);
  }

  .ready {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .resume {
    margin-bottom: 0.75rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .resume p {
    margin: 0 0 0.5rem;
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  .error {
    color: var(--danger);
  }

  /* Narrow windows: the sidebar on top, the page scrolls as a whole. */
  @media (max-width: 760px) {
    .shell {
      grid-template-columns: 1fr;
      height: auto;
      min-height: 100vh;
    }

    .sidebar {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }

    .steps {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .sum,
    .parts {
      display: none;
    }

    .content,
    .view,
    .view.edit {
      overflow: visible;
    }
  }
</style>
