<!--
  Update from my subscription (PLAN.md Q32): the questions when both sides
  changed the same thing, then a short report with Undo update. Shown above
  the open step, in Simple and Advanced mode.
-->
<script lang="ts">
  import type { Choice, Conflict, Note } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import { store } from './store.svelte';

  // The answers, starting on the suggested one for each kind.
  let choices: Record<string, Choice> = $state({});
  $effect(() => {
    const u = store.updating;
    choices = u ? Object.fromEntries(u.conflicts.map((c) => [c.id, c.category === 'critical' ? 'theirs' : 'mine'])) : {};
  });

  const show = (v: unknown): string =>
    v === undefined ? t.update.removed : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ') : typeof v === 'string' ? v : JSON.stringify(v);

  const noteText = (n: Note): string =>
    n.kind === 'server-gone'
      ? format(t.update.notes['server-gone'], { server: n.server })
      : n.kind === 'group-gone' || n.kind === 'group-order'
        ? format(t.update.notes[n.kind], { group: n.group })
        : n.kind === 'rule-gone'
          ? format(t.update.notes['rule-gone'], { rule: n.rule })
          : n.kind === 'name-taken' || n.kind === 'cannot-remove'
            ? format(t.update.notes[n.kind], { name: n.name })
            : t.update.notes['rule-order'];

  const errorText = $derived.by(() => {
    if (!store.updateError) return '';
    const [code, detail = ''] = store.updateError.split('|');
    const reason =
      code === 'refused'
        ? format(t.update.refused, { detail })
        : format(t.input.fetchErrors[code as keyof typeof t.input.fetchErrors] ?? code ?? '', { detail });
    return format(t.update.failed, { reason });
  });

  const label = (c: Conflict) => c.label;
</script>

{#if errorText}
  <p class="error" role="alert">{errorText}</p>
{/if}

{#if store.updating && store.updating.conflicts.length > 0}
  <section class="panel" aria-label={t.update.conflictsTitle}>
    <h3>{t.update.conflictsTitle}</h3>
    <p class="intro">{t.update.conflictsIntro}</p>
    <ul class="conflicts">
      {#each store.updating.conflicts as c (c.id)}
        <li>
          <p class="what">
            <code>{label(c)}</code>
            {#if c.category === 'critical'}<span class="tag">{t.update.critical}</span>{/if}
          </p>
          <label>
            <input type="radio" name={c.id} checked={choices[c.id] === 'mine'} onchange={() => (choices = { ...choices, [c.id]: 'mine' })} />
            <span>{t.update.yours}:</span> <code>{show(c.mine)}</code>
          </label>
          <label>
            <input type="radio" name={c.id} checked={choices[c.id] === 'theirs'} onchange={() => (choices = { ...choices, [c.id]: 'theirs' })} />
            <span>{t.update.theirs}:</span> <code>{show(c.theirs)}</code>
          </label>
          {#if c.original !== undefined}<p class="was">{t.update.original}: <code>{show(c.original)}</code></p>{/if}
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="primary" onclick={() => store.finishUpdate(choices)}>{t.update.apply}</button>
      <button type="button" onclick={() => store.cancelUpdate()}>{t.update.cancel}</button>
    </div>
  </section>
{/if}

{#if store.updateReport}
  <section class="panel report" role="status">
    <p>{format(t.update.done, { applied: store.updateReport.applied })}</p>
    {#if store.updateReport.notes.length === 0}
      <p class="ok">{t.update.allKept}</p>
    {:else}
      <p>{t.update.notesTitle}</p>
      <ul>
        {#each store.updateReport.notes as n, i (i)}<li>{noteText(n)}</li>{/each}
      </ul>
    {/if}
    <div class="row">
      <button type="button" onclick={() => store.undoUpdate()}>{t.update.undo}</button>
      <button type="button" class="link" onclick={() => (store.updateReport = null)}>{t.update.dismiss}</button>
    </div>
  </section>
{/if}

<style>
  .panel {
    margin-bottom: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
    max-height: 60vh;
    overflow-y: auto;
  }

  h3 {
    margin: 0 0 0.35rem;
    font-size: 1rem;
  }

  .intro {
    margin: 0 0 0.6rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .conflicts {
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }

  .conflicts li {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .what {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.3rem;
    font-weight: 600;
  }

  .tag {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--bg);
    background: var(--warn);
  }

  label {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0.15rem 0;
    font-size: 0.9rem;
  }

  code {
    font-size: 0.82rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .was {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .report p {
    margin: 0 0 0.35rem;
  }

  .report ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.9rem;
  }

  .ok {
    color: var(--ok);
  }

  .link {
    border: 0;
    padding: 0;
    color: var(--muted);
    background: none;
    text-decoration: underline;
  }

  .error {
    margin: 0 0 0.6rem;
    color: var(--danger);
  }
</style>
