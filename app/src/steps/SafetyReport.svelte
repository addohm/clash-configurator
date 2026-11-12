<script lang="ts">
  import type { Finding } from '../../../core/src';
  import { format, refusalText, strings as t } from '../i18n';
  import { size } from '../lib/fetch';
  import { store } from '../lib/store.svelte';

  const converted = $derived(store.converted);
  const skippedText = (code: string) =>
    code === 'sip008-plugin' || code === 'sip008-entry'
      ? t.report.sip008[code]
      : format(t.servers.linkErrors[code as keyof typeof t.servers.linkErrors] ?? code, { detail: '' });

  const usage = $derived(store.usage);
  const usageText = $derived(
    usage
      ? format(t.input.usage, {
          used: size(usage.used),
          total: size(usage.total),
          expires: usage.expires ? format(t.input.usageExpires, { date: usage.expires.toLocaleDateString() }) : '',
        })
      : '',
  );

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
  {#if usageText}<p class="usage">{usageText}</p>{/if}
  {#if converted}
    <div class="converted">
      <p>{format(t.report.converted, { servers: converted.servers ?? 0 })}</p>
      {#if converted.skipped && converted.skipped.length > 0}
        <p>{format(t.report.convertedSkipped, { count: converted.skipped.length })}</p>
        <ul>
          {#each converted.skipped.slice(0, 20) as s (s.line)}
            <li>{format(t.report.skippedLine, { line: s.line, reason: skippedText(s.code) })}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
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

  .converted {
    margin-bottom: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-left: 4px solid var(--accent);
    border-radius: 4px;
    background: var(--bg);
    font-size: 0.9rem;
  }

  .converted p {
    margin: 0.25rem 0;
  }

  .converted ul {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--muted);
  }

  .usage {
    font-size: 0.9rem;
    color: var(--muted);
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
