<!--
  The remote control, the dashboard and geo data (Advanced mode, PLAN.md
  Q10 part 7). Text values are checked when they're committed (Enter or
  leaving the field); an empty field removes the setting. The safety checks
  still look at the result in the review (an open controller, an unknown
  dashboard source, plain-http downloads).
-->
<script lang="ts">
  import {
    type Change,
    ChangeError,
    checkFolder,
    checkHostPort,
    checkHours,
    checkHttpsUrl,
    checkSecret,
    DASHBOARDS,
    GEO_FILES,
    type GeoFile,
    randomSecret,
  } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import Info from '../lib/Info.svelte';
  import { store } from '../lib/store.svelte';

  type Map = Record<string, unknown>;
  const isMap = (v: unknown): v is Map => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

  const data = $derived(store.data);
  const geox = $derived(isMap(data['geox-url']) ? data['geox-url'] : {});
  const uiUrl = $derived(str(data['external-ui-url']));
  const known = $derived(DASHBOARDS.find((d) => d.url === uiUrl));

  // One error line per field, by its setting name.
  let errors: Record<string, string> = $state({});
  let showSecret = $state(false);

  function attempt(field: string, make: () => Change[]) {
    errors = { ...errors, [field]: '' };
    try {
      if (!store.edit(make())) errors = { ...errors, [field]: store.editError };
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      errors = { ...errors, [field]: field.startsWith('geox') || field === 'external-ui-url' ? t.controller.httpsOnly : t.controller.bad };
    }
  }

  /** Commits a text field: empty removes the setting, else it's checked and set. */
  function commit(path: string[], raw: string, check: (v: string) => string | number) {
    const field = path.join('.');
    const current = path.length === 1 ? data[path[0] ?? ''] : geox[path[1] ?? ''];
    if (raw.trim() === '') {
      if (current !== undefined) attempt(field, () => [{ op: 'delete', path }]);
      return;
    }
    attempt(field, () => {
      const v = check(raw);
      return v === current ? [] : [{ op: 'set', path, value: v }];
    });
  }

  function chooseDashboard(id: string) {
    if (id === 'other') return;
    if (id === '') {
      if ('external-ui-url' in data) attempt('external-ui-url', () => [{ op: 'delete', path: ['external-ui-url'] }]);
      return;
    }
    const d = DASHBOARDS.find((x) => x.id === id);
    if (!d) return;
    const changes: Change[] = [{ op: 'set', path: ['external-ui-url'], value: d.url }];
    // A dashboard needs a folder to go in.
    if (!('external-ui' in data)) changes.push({ op: 'set', path: ['external-ui'], value: 'ui' });
    attempt('external-ui-url', () => changes);
  }
</script>

<p class="intro">{t.controller.intro}</p>

<div class="columns">
  <fieldset>
    <legend>{t.controller.controllerTitle}</legend>
    <label class="field">
      <span>{t.controller.address} <Info text={t.controller.addressInfo} name="external-controller" /></span>
      <input type="text" value={str(data['external-controller'])} placeholder="127.0.0.1:9090" onchange={(e) => commit(['external-controller'], e.currentTarget.value, checkHostPort)} />
    </label>
    {#if errors['external-controller']}<p class="error" role="alert">{errors['external-controller']}</p>{/if}

    <label class="field">
      <span>{t.controller.secret} <Info text={t.controller.secretInfo} name="secret" /></span>
      <span class="row">
        <input type={showSecret ? 'text' : 'password'} value={str(data['secret'])} autocomplete="off" onchange={(e) => commit(['secret'], e.currentTarget.value, checkSecret)} />
        <button type="button" class="small" onclick={() => (showSecret = !showSecret)}>{showSecret ? t.controller.hide : t.controller.show}</button>
        <button type="button" class="small" onclick={() => attempt('secret', () => [{ op: 'set', path: ['secret'], value: randomSecret() }])}>{t.controller.random}</button>
      </span>
    </label>
    {#if errors['secret']}<p class="error" role="alert">{errors['secret']}</p>{/if}
  </fieldset>

  <fieldset>
    <legend>{t.controller.dashboardTitle}</legend>
    <label class="field">
      <span>{t.controller.source} <Info text={t.controller.sourceInfo} name="external-ui-url" /></span>
      <select value={known ? known.id : uiUrl ? 'other' : ''} onchange={(e) => chooseDashboard(e.currentTarget.value)}>
        <option value="">{t.controller.none}</option>
        {#each DASHBOARDS as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
        {#if uiUrl && !known}<option value="other">{t.controller.other}</option>{/if}
      </select>
    </label>
    {#if errors['external-ui-url']}<p class="error" role="alert">{errors['external-ui-url']}</p>{/if}
    <label class="field">
      <span>{t.controller.folder} <Info text={t.controller.folderInfo} name="external-ui" /></span>
      <input type="text" value={str(data['external-ui'])} placeholder="ui" onchange={(e) => commit(['external-ui'], e.currentTarget.value, checkFolder)} />
    </label>
    {#if errors['external-ui']}<p class="error" role="alert">{errors['external-ui']}</p>{/if}
  </fieldset>

  <fieldset>
    <legend>{t.controller.geoTitle}</legend>
    <label class="check">
      <input type="checkbox" checked={data['geodata-mode'] === true} onchange={(e) => attempt('geodata-mode', () => [{ op: 'set', path: ['geodata-mode'], value: e.currentTarget.checked }])} />
      {t.controller.geodataMode} <Info text={t.controller.geodataModeInfo} name="geodata-mode" />
    </label>
    <label class="check">
      <input type="checkbox" checked={data['geo-auto-update'] === true} onchange={(e) => attempt('geo-auto-update', () => [{ op: 'set', path: ['geo-auto-update'], value: e.currentTarget.checked }])} />
      {t.controller.autoUpdate} <Info text={t.controller.autoUpdateInfo} name="geo-auto-update" />
    </label>
    <label class="field">
      <span>{t.controller.interval} <Info text={t.controller.intervalInfo} name="geo-update-interval" /></span>
      <input class="short" type="text" inputmode="numeric" value={str(data['geo-update-interval'])} placeholder="24" onchange={(e) => commit(['geo-update-interval'], e.currentTarget.value, checkHours)} />
    </label>
    {#if errors['geo-update-interval']}<p class="error" role="alert">{errors['geo-update-interval']}</p>{/if}
    {#each GEO_FILES as file (file)}
      <label class="field wide">
        <span>{format(t.controller.geox, { file })} <Info text={t.controller.geoxInfo} name={`geox-url.${file}`} /></span>
        <input type="text" value={str(geox[file])} placeholder="https://…" spellcheck="false" onchange={(e) => commit(['geox-url', file as GeoFile], e.currentTarget.value, checkHttpsUrl)} />
      </label>
      {#if errors[`geox-url.${file}`]}<p class="error" role="alert">{errors[`geox-url.${file}`]}</p>{/if}
    {/each}
  </fieldset>
</div>

<style>
  .intro {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 1rem;
  }

  fieldset {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  legend {
    font-weight: 600;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.4rem 0;
    font-size: 0.9rem;
  }

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0.35rem 0;
  }

  .row {
    display: flex;
    gap: 0.35rem;
  }

  .row input {
    flex: 1;
  }

  select,
  input[type='text'],
  input[type='password'] {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface);
  }

  .short {
    width: 6rem;
  }

  .small {
    padding: 0.2rem 0.5rem;
    font-size: 0.8rem;
  }

  .error {
    margin: 0 0 0.25rem;
    font-size: 0.85rem;
    color: var(--danger);
  }
</style>
