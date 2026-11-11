<!--
  The ⓘ next to a setting (PLAN.md Q12): hover on a computer, tap on a phone
  (tap anywhere else to close), or keyboard focus. One or two plain sentences,
  with the real setting name in small grey text.
-->
<script lang="ts">
  import { strings as t } from '../i18n';

  let { text, name = '' }: { text: string; name?: string } = $props();
  let open = $state(false);
  let root: HTMLSpanElement | undefined = $state();
  const id = $props.id();

  function outside(e: Event) {
    if (open && root && e.target instanceof Node && !root.contains(e.target)) open = false;
  }
</script>

<svelte:window onclick={outside} />

<span class="info" bind:this={root} role="presentation" onmouseenter={() => (open = true)} onmouseleave={() => (open = false)}>
  <button
    type="button"
    aria-label={t.info}
    aria-expanded={open}
    aria-describedby={open ? id : undefined}
    onclick={() => (open = !open)}
    onfocus={() => (open = true)}
    onblur={() => (open = false)}
    onkeydown={(e) => {
      if (e.key === 'Escape') open = false;
    }}>ⓘ</button
  >
  {#if open}
    <span class="tip" role="tooltip" {id}>
      {text}
      {#if name}<span class="name">{t.settingName} {name}</span>{/if}
    </span>
  {/if}
</span>

<style>
  .info {
    position: relative;
    display: inline-block;
    vertical-align: baseline;
  }

  button {
    border: 0;
    padding: 0 0.2rem;
    font: inherit;
    font-size: 0.95em;
    line-height: 1;
    color: var(--accent);
    background: none;
    cursor: help;
  }

  .tip {
    position: absolute;
    z-index: 10;
    top: calc(100% + 6px);
    left: -0.5rem;
    width: max-content;
    max-width: min(300px, 80vw);
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
    font-size: 0.875rem;
    font-weight: normal;
    line-height: 1.45;
    color: var(--text);
    white-space: normal;
  }

  .name {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.8rem;
    color: var(--muted);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
</style>
