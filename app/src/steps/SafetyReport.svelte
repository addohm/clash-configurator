<script lang="ts">
  import type { Finding } from '../../../core/src';
  import { format, refusalText, strings as t } from '../i18n';
  import { store } from '../lib/store.svelte';

  const checked = $derived(store.checked);
  const findings = $derived(checked?.ok ? checked.findings : []);
  const problems = $derived(findings.filter((f) => f.severity !== 'info').length);

  /** The finding's message, with its details filled in. */
  const text = (f: Finding) => {
    const words = t.findings[f.id];
    const params = f.params ?? {};
    return { title: format(words.title, params), explain: format(words.explain, params), fix: words.fix };
  };

  const where = (f: Finding) => f.path.map((p) => (typeof p === 'number' ? `[${p + 1}]` : p)).join(' > ');
</script>

{#if checked && !checked.ok}
  <div class="refused" role="alert">
    <h3>{t.report.refusedTitle}</h3>
    <p>{refusalText(checked.refusal)}</p>
  </div>
  <div class="actions">
    <button type="button" class="primary" onclick={() => store.restart()}>{t.report.tryAgain}</button>
  </div>
{:else if checked}
  {#if findings.length === 0}
    <p class="clean">{t.report.clean}</p>
  {:else}
    <p>{format(t.report.summary, { problems, notes: findings.length - problems })}</p>
    {#if findings.some((f) => f.fix)}<p class="hint">{t.report.keepAsIs}</p>{/if}
    <ul class="findings">
      {#each findings as f, i (i)}
        {@const words = text(f)}
        <li class={f.severity}>
          <div class="head">
            <span class="badge">{t.report.severities[f.severity]}</span>
            <strong>{words.title}</strong>
          </div>
          <p>{words.explain}</p>
          {#if f.path.length > 0}<p class="where">{t.settingName} {where(f)}</p>{/if}
          {#if f.fix && words.fix}
            <label class="fix">
              <input type="checkbox" checked={store.ticked[i]} onchange={() => store.toggleFix(i)} />
              {words.fix}
            </label>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="actions">
    <button type="button" class="primary" onclick={() => store.startEditing()}>{t.report.continue}</button>
  </div>
{/if}

<style>
  .refused {
    padding: 0.75rem 1rem;
    border-left: 4px solid var(--danger);
    border-radius: 4px;
    background: var(--bg);
  }

  .refused h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }

  .refused p {
    margin: 0;
  }

  .clean {
    color: var(--ok);
  }

  .hint {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .findings {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .findings li {
    padding: 0.75rem 1rem;
    border-left: 4px solid var(--muted);
    border-radius: 4px;
    background: var(--bg);
  }

  .findings li.danger {
    border-left-color: var(--danger);
  }

  .findings li.warning {
    border-left-color: var(--warn);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
  }

  .badge {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--bg);
    background: var(--muted);
  }

  .danger .badge {
    background: var(--danger);
  }

  .warning .badge {
    background: var(--warn);
  }

  .findings p {
    margin: 0.35rem 0 0;
    font-size: 0.9rem;
  }

  .findings .where {
    font-size: 0.8rem;
    color: var(--muted);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .fix {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .actions {
    margin-top: 1rem;
  }
</style>
