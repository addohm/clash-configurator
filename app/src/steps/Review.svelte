<!--
  Step 5: what changed (the original and the new config compared line by
  line), what the safety checks still flag, and saving the config and the
  settings file.
-->
<script lang="ts">
  import { compareConfigs, type Dropped, type LinkBlocker, type LinkLoss, outputNames, writeSettings } from '../../../core/src';
  import { format, refusalText, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { saveFile, type SaveKind } from '../lib/save';
  import SendToPhone from '../lib/SendToPhone.svelte';
  import { sharePlan } from '../lib/share';
  import { store } from '../lib/store.svelte';

  /** How many changed parts to show before "Show them". */
  const FIRST_HUNKS = 30;

  const review = $derived(store.review);
  const plan = $derived(review?.plan ?? null);
  const lossText = (l: LinkLoss) =>
    l.kind === 'first'
      ? format(t.review.losses.first, { group: l.group, now: l.now, was: l.was })
      : l.kind === 'order'
        ? format(t.review.losses.order, { group: l.group })
        : l.kind === 'server-settings'
          ? format(t.review.losses['server-settings'], { server: l.server })
          : t.review.losses['new-servers-hidden'];
  const blockerText = (b: LinkBlocker) =>
    b.kind === 'rule'
      ? format(t.review.blockers.rule, { n: b.index + 1, server: b.server })
      : b.kind === 'setting'
        ? format(t.review.blockers.setting, { path: b.path, server: b.server })
        : t.review.blockers[b.kind];
  const comparison = $derived(review && store.original !== null ? compareConfigs(store.original, review.output) : null);
  const flagged = $derived(review?.result.ok ? review.result.findings.filter((f) => f.severity !== 'info') : []);
  const names = $derived(outputNames(store.source ?? { kind: 'paste' }));
  const changes = $derived(store.session?.changes.length ?? 0);
  const appName = $derived(store.app ? t.apps[store.app] : '');
  const shadowrocket = $derived(review?.shadowrocket ?? null);
  const share = $derived(review ? sharePlan(store.app, review.output, shadowrocket, names) : null);
  /** What the chosen app's files leave out, by kind. */
  const dropped = $derived.by(() => {
    const all = review?.dropped ?? [];
    const of = <K extends Dropped['kind']>(k: K) => all.filter((d): d is Extract<Dropped, { kind: K }> => d.kind === k);
    const settings = of('setting').filter((d) => d.key !== 'proxy-providers');
    return { any: all.length > 0, settings, rules: of('rule'), servers: of('server'), groups: of('group'), providers: all.length > settings.length + of('rule').length + of('server').length + of('group').length };
  });

  let showAll = $state(false);
  let showWhole = $state(false);
  let status = $state('');
  let failed = $state(false);

  async function save(kind: SaveKind) {
    if (!review?.result.ok || !store.session) return;
    const name = names[kind];
    const contents =
      kind === 'settings'
        ? writeSettings(store.session)
        : kind === 'conf'
          ? (shadowrocket?.conf ?? '')
          : kind === 'servers'
            ? (shadowrocket?.nodes ?? '')
            : review.output;
    const r = await saveFile(kind, name, contents);
    failed = r.status === 'failed';
    status =
      r.status === 'saved'
        ? format(t.review.saved, { path: r.path })
        : r.status === 'downloaded'
          ? format(t.review.downloaded, { name })
          : r.status === 'cancelled'
            ? t.review.cancelled
            : format(t.review.failed, { reason: r.reason });
  }
</script>

<p class="intro">{t.review.intro}</p>

{#if review && !review.result.ok}
  <p class="error" role="alert">{format(t.review.refused, { reason: refusalText(review.result.refusal) })}</p>
{:else if review}
  <p>{changes > 0 ? format(t.review.changes, { count: changes }) : t.review.noChanges}</p>

  {#if flagged.length > 0}
    <div class="flagged">
      <p>{t.review.stillFlagged}</p>
      <ul>
        {#each flagged as f, i (i)}<li class={f.severity}>{format(t.findings[f.id].title, f.params ?? {})}</li>{/each}
      </ul>
    </div>
  {:else}
    <p class="ok">{t.review.clean}</p>
  {/if}

  {#if plan}
    <div class="link-servers">
      <label class="check">
        <input type="checkbox" checked={store.linkServers && plan.ok} disabled={!plan.ok} onchange={(e) => (store.linkServers = e.currentTarget.checked)} />
        {t.review.link}
        <Info text={t.review.linkInfo} name="proxy-providers" />
      </label>
      {#if !plan.ok}
        <p class="muted">{t.review.linkBlocked}</p>
        <ul>{#each plan.blockers as b, i (i)}<li>{blockerText(b)}</li>{/each}</ul>
      {:else if store.linkServers && plan.losses.length > 0}
        <p>{t.review.linkLosses}</p>
        <ul>{#each plan.losses as l, i (i)}<li>{lossText(l)}</li>{/each}</ul>
      {/if}
      {#if plan.ok && store.linkServers}
        {#each plan.warnings as w, i (i)}
          <p class="warning">{format(t.review.warnings[w.kind], { count: w.count, patterns: w.patterns.join(', ') })}</p>
        {/each}
      {/if}
    </div>
  {/if}

  {#if comparison && comparison.hunks.length > 0}
    <h3>{t.review.compare} <Info text={t.review.compareInfo} /></h3>
    {#if comparison}
      <p class="muted">{format(t.review.lines, { added: comparison.added, removed: comparison.removed })}</p>
      <div class="diff" role="region" aria-label={t.review.compare}>
        {#each showAll ? comparison.hunks : comparison.hunks.slice(0, FIRST_HUNKS) as h, hi (hi)}
          <table>
            <tbody>
              {#each h.lines as l, li (li)}
                <tr class={l.kind}>
                  <td class="no">{l.oldNo ?? ''}</td>
                  <td class="no">{l.newNo ?? ''}</td>
                  <td class="mark">{l.kind === 'added' ? '+' : l.kind === 'removed' ? '−' : ''}</td>
                  <td class="text">{l.text}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/each}
      </div>
      {#if !showAll && comparison.hunks.length > FIRST_HUNKS}
        <p class="muted">
          {format(t.review.moreHidden, { count: comparison.hunks.length - FIRST_HUNKS })}
          <button type="button" class="link" onclick={() => (showAll = true)}>{t.review.showMore}</button>
        </p>
      {/if}
    {/if}
  {/if}

  {#if dropped.any}
    <div class="dropped">
      <h3>{format(t.review.dropped.title, { app: appName })} <Info text={format(t.review.dropped.info, { app: appName })} /></h3>
      <ul>
        {#if dropped.settings.length > 0}
          <li>{format(t.review.dropped.settings, { count: dropped.settings.length, app: appName, keys: dropped.settings.map((d) => d.key).join(', ') })}</li>
        {/if}
        {#each dropped.servers as d (d.name)}<li>{format(t.review.dropped.server, { name: d.name, reason: d.reason, app: appName })}</li>{/each}
        {#each dropped.groups as d (d.name)}<li>{format(t.review.dropped.group[d.reason], { name: d.name })}</li>{/each}
        {#if dropped.providers}<li>{t.review.dropped.providers}</li>{/if}
        {#if dropped.rules.length > 0}
          <li>
            {format(t.review.dropped.rules, { count: dropped.rules.length, app: appName })}
            <details>
              <summary>{t.review.dropped.showRules}</summary>
              <ul class="rules">{#each dropped.rules.slice(0, 500) as d, i (i)}<li>{d.rule}</li>{/each}</ul>
            </details>
          </li>
        {/if}
      </ul>
    </div>
  {/if}

  {#if shadowrocket}<p class="note">{t.review.shadowrocket}</p>{/if}

  <div class="actions">
    {#if shadowrocket}
      <button type="button" class="primary" onclick={() => save('conf')}>{t.review.saveConf}</button>
      <button type="button" class="primary" onclick={() => save('servers')}>{t.review.saveServers}</button>
    {:else}
      <button type="button" class="primary" onclick={() => save('config')}>{t.review.saveConfig}</button>
    {/if}
    <span class="with-info">
      <button type="button" onclick={() => save('settings')}>{t.review.saveSettings}</button>
      <Info text={t.review.saveSettingsInfo} />
    </span>
    <button type="button" class="link" onclick={() => (showWhole = !showWhole)}>{showWhole ? t.review.hideWhole : t.review.showWhole}</button>
    {#if share}<SendToPhone files={share.files} page={share.page} />{/if}
  </div>
  {#if status}<p class={failed ? 'error' : 'ok'} role="status">{status}</p>{/if}

  {#if showWhole}
    <label class="whole">
      <span>{shadowrocket ? t.review.wholeConf : t.review.wholeLabel}</span>
      <textarea readonly spellcheck="false" value={shadowrocket ? shadowrocket.conf : review.output}></textarea>
    </label>
  {/if}
{/if}

<style>
  .intro {
    margin: 0 0 0.75rem;
    color: var(--muted);
  }

  h3 {
    margin: 1rem 0 0.25rem;
    font-size: 1rem;
  }

  .flagged {
    padding: 0.5rem 0.75rem;
    border-left: 4px solid var(--warn);
    border-radius: 4px;
    background: var(--bg);
  }

  .flagged p {
    margin: 0 0 0.25rem;
  }

  .flagged ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .flagged li.danger {
    color: var(--danger);
  }

  .diff {
    max-height: 32rem;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    border-bottom: 1px dashed var(--border);
  }

  td {
    padding: 0 0.4rem;
    vertical-align: top;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .no {
    width: 3.5rem;
    text-align: right;
    color: var(--muted);
    user-select: none;
  }

  .mark {
    width: 1rem;
    user-select: none;
  }

  tr.added {
    background: color-mix(in srgb, var(--ok) 15%, transparent);
  }

  tr.removed {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
  }

  .link-servers {
    margin: 0.75rem 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  .link-servers .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
  }

  .link-servers p {
    margin: 0.4rem 0 0.2rem;
    font-size: 0.9rem;
  }

  .link-servers .warning {
    color: var(--warn);
  }

  .link-servers ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.9rem;
  }

  .dropped {
    margin: 0.75rem 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    font-size: 0.9rem;
  }

  .dropped h3 {
    margin: 0 0 0.25rem;
    font-size: 0.95rem;
  }

  .dropped ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .dropped .rules {
    max-height: 12rem;
    overflow: auto;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
  }

  .note {
    padding: 0.5rem 0.75rem;
    border-left: 4px solid var(--accent);
    border-radius: 4px;
    background: var(--bg);
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .with-info {
    display: inline-flex;
    align-items: center;
  }

  .link {
    border: 0;
    padding: 0;
    color: var(--accent);
    background: none;
  }

  .whole {
    display: block;
    margin-top: 1rem;
  }

  .whole span {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  textarea {
    width: 100%;
    min-height: 20rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
    color: var(--text);
    background: var(--bg);
  }

  .ok {
    color: var(--ok);
  }

  .error {
    color: var(--danger);
  }

  .muted {
    font-size: 0.875rem;
    color: var(--muted);
  }
</style>
