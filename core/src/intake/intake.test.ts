import { describe, expect, it } from 'vitest';
import {
  applyFixes,
  defaultFixes,
  intake,
  isLoopback,
  isUnsafePath,
  LIMITS,
  looksLikeShareLinks,
  parseConfig,
  splitHostPort,
  type Intake,
} from '.';

// The test configs, read as text by Vite at test time (no Node file access).
const FIXTURES = import.meta.glob<string>('../../../fixtures/{configs,hostile}/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const fixture = (path: string): string => {
  const text = FIXTURES[`../../../fixtures/${path}`];
  if (text === undefined) throw new Error(`no fixture ${path}`);
  return text;
};
const SERVER = 'proxies: [{name: a, type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}]\n';

function refused(result: Intake) {
  expect(result.ok).toBe(false);
  return result.ok ? null : result.refusal;
}

function accepted(result: Intake) {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  return result;
}

describe('intake refuses hostile input', () => {
  const cases: [string, string][] = [
    ['hostile/python-tag.yaml', 'tags'],
    ['hostile/billion-laughs.yaml', 'alias-bomb'],
    ['hostile/proto.yaml', 'bad-key'],
    ['hostile/duplicate-keys.yaml', 'duplicate-keys'],
    ['hostile/multi-document.yaml', 'multiple-documents'],
    ['hostile/complex-key.yaml', 'bad-key'],
    ['hostile/html.txt', 'html'],
    ['hostile/not-clash.yaml', 'not-clash'],
    ['hostile/share-links.txt', 'share-links'],
    ['hostile/share-links-base64.txt', 'share-links'],
  ];
  for (const [file, code] of cases) {
    it(`${file}: ${code}`, () => {
      expect(refused(intake(fixture(file)))?.code).toBe(code);
    });
  }

  it('says where the problem is', () => {
    expect(refused(intake(fixture('hostile/python-tag.yaml')))).toMatchObject({ code: 'tags', line: 3 });
    expect(refused(intake(fixture('hostile/duplicate-keys.yaml')))?.line).toBe(4);
  });

  it('leaves JavaScript objects alone', () => {
    intake(fixture('hostile/proto.yaml'));
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('refuses anything over the size limit before reading it', () => {
    expect(refused(intake('#'.repeat(LIMITS.maxBytes + 1)))?.code).toBe('too-big');
    expect(refused(intake(new Uint8Array(LIMITS.maxBytes + 1)))?.code).toBe('too-big');
  });

  it('refuses deep nesting, in brackets or by indentation', () => {
    expect(refused(intake(`a: ${'['.repeat(5000)}${']'.repeat(5000)}\n${SERVER}`))?.code).toBe('too-deep');
    let nested = '';
    for (let i = 0; i < LIMITS.maxDepth + 5; i++) nested += `${'  '.repeat(i)}a:\n`;
    expect(refused(intake(`${nested}${'  '.repeat(LIMITS.maxDepth + 5)}b: 1\n${SERVER}`))?.code).toBe('too-deep');
  });

  it('ignores brackets inside quotes and comments when checking depth', () => {
    const text = `name: "${'['.repeat(300)}"\n# ${'{'.repeat(300)}\n${SERVER}`;
    expect(intake(text).ok).toBe(true);
  });

  it('refuses too many nodes', () => {
    const result = parseConfig(`${SERVER}x: [${'1,'.repeat(200)}1]\n`, { ...LIMITS, maxNodes: 100 });
    expect(result.ok ? null : result.refusal.code).toBe('too-many-nodes');
  });

  it('refuses what is not text', () => {
    expect(refused(intake(new Uint8Array([0xff, 0xfe, 0xfd])))?.code).toBe('binary');
    expect(refused(intake(`a: 1\u0000\n${SERVER}`))?.code).toBe('binary');
  });

  it('refuses empty input, a list, and broken YAML', () => {
    expect(refused(intake('  \n\n'))?.code).toBe('empty');
    expect(refused(intake('- a\n- b\n'))?.code).toBe('not-a-map');
    expect(refused(intake('a: [1, 2\n'))?.code).toBe('not-yaml');
  });

  it('refuses a config with no servers', () => {
    expect(refused(intake('mixed-port: 7890\nproxies: []\n'))?.code).toBe('not-clash');
  });
});

describe('intake accepts real-world shapes', () => {
  it('a typical provider config, with anchors and merge keys', () => {
    const r = accepted(intake(fixture('configs/provider-basic.yaml')));
    const groups = r.data['proxy-groups'] as { name: string; interval?: number }[];
    expect(groups.find((g) => g.name === 'Auto')?.interval).toBe(300);
    // Only the anchor's holder key, which mihomo doesn't know, is listed.
    expect(r.findings.map((f) => f.id)).toEqual(['unknown-keys']);
    expect(r.findings[0]?.params?.['keys']).toBe('auto');
  });

  it('a web-panel config', () => {
    const r = accepted(intake(fixture('configs/panel-style.yaml')));
    expect(r.findings.map((f) => f.id)).toEqual(['allow-lan', 'controller-no-secret']);
  });

  it('a config with providers and no proxies list', () => {
    expect(accepted(intake(fixture('configs/providers.yaml'))).findings).toEqual([]);
  });

  it('bytes with a byte-order mark', () => {
    const bytes = new TextEncoder().encode(`\uFEFF${SERVER}`);
    expect(intake(bytes).ok).toBe(true);
  });
});

describe('the risky config', () => {
  const r = accepted(intake(fixture('configs/risky.yaml')));
  const ids = r.findings.map((f) => f.id);

  it('flags every risky setting', () => {
    expect(new Set(ids)).toEqual(
      new Set([
        'controller-open-no-secret',
        'allow-lan',
        'listener-open',
        'dns-listen-open',
        'dashboard-download',
        'insecure-download',
        'unsafe-path',
        'scripts',
        'mitm',
        'rewrite',
        'tunnels',
        'hosts',
        'hidden-characters',
        'unknown-keys',
      ]),
    );
  });

  it('puts the most serious first', () => {
    const order = { danger: 0, warning: 1, info: 2 };
    const ranks = r.findings.map((f) => order[f.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('flags only the listener open to the network', () => {
    const open = r.findings.filter((f) => f.id === 'listener-open');
    expect(open.map((f) => f.params?.['name'])).toEqual(['open-socks']);
  });

  it('flags both unsafe paths and both scripts', () => {
    expect(r.findings.filter((f) => f.id === 'unsafe-path').map((f) => f.path)).toEqual([
      ['proxy-providers', 'main', 'path'],
      ['external-ui'],
    ]);
    expect(r.findings.filter((f) => f.id === 'scripts').map((f) => f.path)).toEqual([['script'], ['http', 'script']]);
  });

  it('points at the hidden characters', () => {
    const hidden = r.findings.find((f) => f.id === 'hidden-characters');
    expect(hidden?.path).toEqual(['proxies', 1, 'name']);
    expect(hidden?.params?.['count']).toBe(2);
  });

  it('fixes what is ticked, keeps comments, and leaves the rest', () => {
    const doc = r.doc.clone();
    applyFixes(doc, defaultFixes(r.findings));
    const text = doc.toString();
    expect(text).toContain('# A made-up config with every risky setting the checks flag.');
    const again = accepted(intake(text));
    expect(again.data['allow-lan']).toBe(false);
    expect(again.data['external-controller']).toBe('127.0.0.1:9090');
    expect((again.data['dns'] as Record<string, unknown>)['listen']).toBe('127.0.0.1:53');
    expect(again.data['script']).toBeUndefined();
    expect(again.data['http']).toEqual({});
    // Not ticked by default: switching to https, which might not work.
    expect(new Set(again.findings.map((f) => f.id))).toEqual(
      new Set(['controller-no-secret', 'insecure-download', 'tunnels', 'hosts', 'hidden-characters', 'unknown-keys']),
    );
  });

  it('can set a controller password the user chooses to add', () => {
    const doc = r.doc.clone();
    applyFixes(doc, defaultFixes(r.findings));
    const next = accepted(intake(doc.toString()));
    const add = next.findings.filter((f) => f.id === 'controller-no-secret');
    applyFixes(next.doc, add);
    const secret = accepted(intake(next.doc.toString())).data['secret'];
    expect(secret).toMatch(/^[0-9a-f]{36}$/);
  });
});

describe('helpers', () => {
  it('splits host and port', () => {
    expect(splitHostPort('127.0.0.1:9090')).toEqual({ host: '127.0.0.1', port: '9090' });
    expect(splitHostPort(':9090')).toEqual({ host: '', port: '9090' });
    expect(splitHostPort('[::1]:9090')).toEqual({ host: '::1', port: '9090' });
    expect(splitHostPort('::')).toEqual({ host: '::', port: '' });
  });

  it('knows loopback addresses', () => {
    for (const h of ['127.0.0.1', '127.1.2.3', 'localhost', 'LOCALHOST', '::1']) expect(isLoopback(h)).toBe(true);
    for (const h of ['', '0.0.0.0', '::', '192.168.1.5', '10.0.0.1', 'example.com']) expect(isLoopback(h)).toBe(false);
  });

  it('knows paths that leave the app folder', () => {
    for (const p of ['/etc/passwd', '../x', 'a/../../b', 'C:\\Windows', '~/x', '..\\x']) expect(isUnsafePath(p)).toBe(true);
    for (const p of ['./rules/ads.mrs', 'providers/main.yaml', 'ui', '..x/y']) expect(isUnsafePath(p)).toBe(false);
  });

  it('spots share-link lists', () => {
    expect(looksLikeShareLinks(fixture('hostile/share-links.txt'))).toBe(true);
    expect(looksLikeShareLinks(fixture('hostile/share-links-base64.txt'))).toBe(true);
    expect(looksLikeShareLinks(SERVER)).toBe(false);
    expect(looksLikeShareLinks('aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYSBsaW5r')).toBe(false);
  });
});
