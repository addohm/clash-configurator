<script lang="ts">
  import { LIMITS } from '../../../core/src';
  import { format, strings as t } from '../i18n';
  import { inApp } from '../lib/save';
  import Info from '../lib/Info.svelte';
  import { store } from '../lib/store.svelte';

  let url = $state(store.rememberedUrl);
  let fetching = $state(false);
  const canFetch = inApp();

  async function fetchUrl() {
    error = '';
    fetching = true;
    try {
      const r = await store.checkUrl(url);
      if (!r.ok) error = format(t.input.fetchErrors[r.code], { detail: r.detail });
    } finally {
      fetching = false;
    }
  }

  let text = $state('');
  let error = $state('');
  let configInput: HTMLInputElement | undefined = $state();
  let settingsInput: HTMLInputElement | undefined = $state();
  let dragging = $state(false);

  /** Reads a chosen file as bytes, refusing big ones without reading them. */
  async function readFile(file: File): Promise<Uint8Array | null> {
    if (file.size > LIMITS.maxBytes) {
      error = t.input.tooBig;
      return null;
    }
    return new Uint8Array(await file.arrayBuffer());
  }

  async function openConfig(file: File | undefined) {
    if (!file) return;
    error = '';
    const bytes = await readFile(file);
    if (bytes) store.check(bytes, { kind: 'file', name: file.name.slice(0, 255) });
  }

  async function openSettings(file: File | undefined) {
    if (!file) return;
    error = '';
    // Settings files hold the config plus changes, so they may be a little bigger.
    if (file.size > LIMITS.maxBytes * 3) {
      error = t.settingsErrors['too-big'];
      return;
    }
    const r = store.restore(await file.text());
    if (!r.ok) error = format(t.settingsErrors[r.error], { detail: r.detail ?? '' });
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    void openConfig(e.dataTransfer?.files[0]);
  }
</script>

<p class="intro">{t.input.intro}</p>

<label class="label" for="config-text">
  {t.input.pasteLabel}
  <Info text={t.input.pasteInfo} />
</label>
<textarea
  id="config-text"
  class:dragging
  bind:value={text}
  placeholder={t.input.placeholder}
  spellcheck="false"
  autocomplete="off"
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
></textarea>
<p class="hint">{t.input.dropHint}</p>

<div class="url">
  <label class="label" for="config-url">{t.input.urlLabel} <Info text={t.input.urlInfo} /></label>
  {#if canFetch}
    <form
      class="url-row"
      onsubmit={(e) => {
        e.preventDefault();
        void fetchUrl();
      }}
    >
      <input id="config-url" type="url" bind:value={url} placeholder={t.input.urlPlaceholder} spellcheck="false" autocomplete="off" />
      <button type="submit" disabled={url.trim() === '' || fetching}>{fetching ? t.input.fetching : t.input.fetch}</button>
    </form>
  {:else}
    <p class="hint">{t.input.fetchErrors['not-in-app']}</p>
  {/if}
</div>

{#if error}<p class="error" role="alert">{error}</p>{/if}

<div class="actions">
  <button type="button" class="primary" disabled={text.trim() === ''} onclick={() => store.check(text, { kind: 'paste' })}>
    {t.input.check}
  </button>
  <button type="button" onclick={() => configInput?.click()}>{t.input.openFile}</button>
  <span class="with-info">
    <button type="button" onclick={() => settingsInput?.click()}>{t.input.openSettings}</button>
    <Info text={t.input.openSettingsInfo} />
  </span>
</div>

<input
  bind:this={configInput}
  type="file"
  accept=".yaml,.yml,.txt,.conf"
  hidden
  onchange={(e) => void openConfig(e.currentTarget.files?.[0])}
/>
<input
  bind:this={settingsInput}
  type="file"
  accept=".json"
  hidden
  onchange={(e) => void openSettings(e.currentTarget.files?.[0])}
/>

<style>
  .intro {
    margin: 0 0 0.75rem;
    color: var(--muted);
  }

  .label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 12rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.85rem;
    color: var(--text);
    background: var(--bg);
    resize: vertical;
  }

  textarea.dragging {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .hint {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .error {
    margin: 0.75rem 0 0;
    color: var(--danger);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .url {
    margin-top: 1rem;
  }

  .url-row {
    display: flex;
    gap: 0.5rem;
  }

  .url-row input {
    flex: 1;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font: inherit;
    color: var(--text);
    background: var(--bg);
  }

  .with-info {
    display: inline-flex;
    align-items: center;
  }
</style>
