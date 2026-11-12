<!--
  A QR code drawn as one SVG path (no inline styles, so the app's CSP is
  happy). Medium error correction: a phone reads it off a screen easily.
-->
<script lang="ts">
  import { encode } from 'uqr';

  let { text, label }: { text: string; label: string } = $props();

  const qr = $derived(encode(text, { ecc: 'M', border: 2 }));
  const path = $derived(
    qr.data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join(''),
  );
</script>

<svg class="qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={label} shape-rendering="crispEdges">
  <rect width={qr.size} height={qr.size} fill="#fff" />
  <path d={path} fill="#000" />
</svg>

<style>
  .qr {
    display: block;
    width: 13rem;
    height: 13rem;
    border-radius: 6px;
  }
</style>
