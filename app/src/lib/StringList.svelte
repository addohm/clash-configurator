<!--
  An editable list of short strings (DNS servers, site patterns): add with
  the field below, move, remove. The parent makes the changes and returns
  why one was refused, if it was.
-->
<script lang="ts">
  import { strings as t } from '../i18n';
  import Info from './Info.svelte';

  let {
    label,
    info,
    name,
    items,
    placeholder,
    onadd,
    onremove,
    onmove,
  }: {
    label: string;
    info: string;
    name: string;
    items: readonly string[];
    placeholder: string;
    onadd: (value: string) => string | null;
    onremove: (index: number) => string | null;
    onmove?: (from: number, to: number) => string | null;
  } = $props();

  let value = $state('');
  let error = $state('');
  const id = $props.id();

  function add() {
    const why = onadd(value);
    error = why ?? '';
    if (why === null) value = '';
  }
</script>

<div class="list">
  <label class="label" for={id}>{label} <Info text={info} {name} /></label>
  {#if items.length === 0}
    <p class="muted">{t.dns.empty}</p>
  {:else}
    <ol>
      {#each items as item, i (`${i}-${item}`)}
        <li>
          <code>{item}</code>
          <span class="buttons">
            {#if onmove}
              <button type="button" class="small" aria-label={t.dns.up} disabled={i === 0} onclick={() => (error = onmove(i, i - 1) ?? '')}>↑</button>
              <button type="button" class="small" aria-label={t.dns.down} disabled={i === items.length - 1} onclick={() => (error = onmove(i, i + 1) ?? '')}>↓</button>
            {/if}
            <button type="button" class="small" aria-label={t.dns.remove} onclick={() => (error = onremove(i) ?? '')}>✕</button>
          </span>
        </li>
      {/each}
    </ol>
  {/if}
  <form
    class="add"
    onsubmit={(e) => {
      e.preventDefault();
      add();
    }}
  >
    <input {id} type="text" bind:value {placeholder} spellcheck="false" autocomplete="off" />
    <button type="submit" disabled={value.trim() === ''}>{t.dns.add}</button>
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .list {
    margin-bottom: 1rem;
  }

  .label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  ol {
    margin: 0 0 0.4rem;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    max-height: 16rem;
    overflow-y: auto;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  li:last-child {
    border-bottom: 0;
  }

  code {
    font-size: 0.85rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .buttons {
    display: inline-flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .small {
    padding: 0.1rem 0.45rem;
    font-size: 0.8rem;
  }

  .add {
    display: flex;
    gap: 0.35rem;
  }

  input {
    flex: 1;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    font-size: 0.9rem;
    color: var(--text);
    background: var(--surface);
  }

  .muted {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .error {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
    color: var(--danger);
  }
</style>
