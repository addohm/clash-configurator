import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import {
  applyChange,
  build,
  type Change,
  ChangeError,
  defaultFixes,
  detectStyle,
  intake,
  readSettings,
  SETTINGS_FORMAT,
  type Session,
  startSession,
  validateChange,
  writeSettings,
  writeYaml,
} from '..';

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

function session(file: string, changes: Change[] = []): Session {
  return { app: 'mihomo', mode: 'simple', source: { kind: 'paste' }, original: fixture(file), changes };
}

function built(s: Session) {
  const b = build(s);
  if (!b.ok) throw new Error(`build failed: ${JSON.stringify(b)}`);
  return b;
}

/** Lines that differ between two texts, as "line: before -> after". */
// Git for Windows checks text files out with CRLF line endings, so the
// fixtures can come with either; these make a test independent of that.
const lf = (text: string) => text.replace(/\r\n/g, '\n');
const crlf = (text: string) => lf(text).replace(/\n/g, '\r\n');

function diff(a: string, b: string): string[] {
  const x = a.split(/\r?\n/);
  const y = b.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push(`${i + 1}: ${x[i]} -> ${y[i]}`);
  return out;
}

describe('output with no changes', () => {
  for (const file of ['provider-basic', 'panel-style', 'providers', 'indentless', 'risky']) {
    for (const [endings, convert] of [
      ['LF', lf],
      ['CRLF', crlf],
    ] as const) {
      it(`${file}.yaml comes back unchanged (${endings})`, () => {
        const text = convert(fixture(`configs/${file}.yaml`));
        const r = intake(text);
        if (!r.ok) throw new Error('refused');
        expect(writeYaml(r.doc, text)).toBe(text);
      });
    }
  }

  it('reads the original layout', () => {
    expect(detectStyle(fixture('configs/indentless.yaml')).indentSeq).toBe(false);
    expect(detectStyle(fixture('configs/provider-basic.yaml')).indentSeq).toBe(true);
    expect(detectStyle(fixture('configs/panel-style.yaml')).flowPadding).toBe(false);
  });
});

describe('changes', () => {
  it('change one value, and only that line changes', () => {
    const s = session('configs/provider-basic.yaml', [{ op: 'set', path: ['mixed-port'], value: 7890 }]);
    expect(diff(s.original, built(s).output)).toEqual(['3: mixed-port: 7897 -> mixed-port: 7890']);
  });

  it('keeps a comment on a changed line', () => {
    const doc = parseDocument('mode: rule # how traffic is routed\n');
    applyChange(doc, { op: 'set', path: ['mode'], value: 'global' });
    expect(doc.toString()).toBe('mode: global # how traffic is routed\n');
  });

  it('creates missing maps on the way to a new setting', () => {
    const s = session('configs/indentless.yaml', [{ op: 'set', path: ['dns', 'enable'], value: true }]);
    expect(built(s).doc.toJS().dns).toEqual({ enable: true });
  });

  it('adds, moves and removes list items', () => {
    const s = session('configs/indentless.yaml', [
      { op: 'insert', path: ['rules'], index: 0, value: 'DOMAIN,example.net,REJECT' },
      { op: 'move', path: ['rules'], from: 2, to: 0 },
      { op: 'delete', path: ['proxies', 1] },
      { op: 'delete', path: ['proxy-groups', 0, 'proxies', 1] },
    ]);
    const data = built(s).doc.toJS();
    expect(data.rules).toEqual(['MATCH,Proxy', 'DOMAIN,example.net,REJECT', 'DOMAIN-SUFFIX,example.org,DIRECT']);
    expect(data.proxies.map((p: { name: string }) => p.name)).toEqual(['Server A']);
  });

  it('keeps flush lists flush when adding to them', () => {
    const s = session('configs/indentless.yaml', [{ op: 'insert', path: ['rules'], value: 'GEOIP,CN,DIRECT' }]);
    expect(lf(built(s).output)).toContain('- MATCH,Proxy\n- GEOIP,CN,DIRECT\n');
  });

  it("can't smuggle in settings through a value", () => {
    const sneaky = 'Server A\nexternal-controller: 0.0.0.0:9090';
    const s = session('configs/indentless.yaml', [{ op: 'set', path: ['proxies', 0, 'name'], value: sneaky }]);
    const out = built(s);
    const again = intake(out.output);
    if (!again.ok) throw new Error('refused');
    expect(again.data['external-controller']).toBeUndefined();
    expect((again.data['proxies'] as { name: string }[])[0]?.name).toBe(sneaky);
  });

  it('says which change does not fit', () => {
    const s = session('configs/indentless.yaml', [
      { op: 'set', path: ['mode'], value: 'global' },
      { op: 'move', path: ['rules'], from: 0, to: 9 },
    ]);
    expect(build(s)).toMatchObject({ ok: false, reason: 'change', index: 1 });
    expect(() => applyChange(parseDocument('a: 1'), { op: 'delete', path: ['b'] })).toThrow(ChangeError);
    expect(() => applyChange(parseDocument('a: 1'), { op: 'insert', path: ['a'], value: 1 })).toThrow(ChangeError);
  });

  it('refuses a result with no servers left', () => {
    const s = session('configs/indentless.yaml', [{ op: 'delete', path: ['proxies'] }]);
    expect(build(s)).toMatchObject({ ok: false, reason: 'result', refusal: { code: 'not-clash' } });
  });

  it("checks the user's own changes like anything else", () => {
    const s = session('configs/indentless.yaml', [{ op: 'set', path: ['allow-lan'], value: true }]);
    expect(built(s).findings.map((f) => f.id)).toContain('allow-lan');
  });

  it('starts a session with the ticked fixes as changes', () => {
    const text = fixture('configs/risky.yaml');
    const r = intake(text);
    if (!r.ok) throw new Error('refused');
    const s = startSession(text, { kind: 'paste' }, 'mihomo', 'simple', defaultFixes(r.findings));
    const ids = built(s).findings.map((f) => f.id);
    expect(ids).not.toContain('allow-lan');
    expect(ids).not.toContain('scripts');
    expect(ids).not.toContain('unsafe-path');
  });
});

describe('validating changes from a file', () => {
  it('accepts well-formed changes', () => {
    expect(validateChange({ op: 'set', path: ['dns', 'enable'], value: true })).toEqual({
      op: 'set',
      path: ['dns', 'enable'],
      value: true,
    });
    expect(validateChange({ op: 'insert', path: ['rules'], value: 'MATCH,DIRECT' })).toEqual({
      op: 'insert',
      path: ['rules'],
      value: 'MATCH,DIRECT',
    });
  });

  const bad: [string, unknown][] = [
    ['unknown op', { op: 'eval', path: [] }],
    ['poison key in path', { op: 'set', path: ['__proto__', 'x'], value: 1 }],
    ['poison key in value', { op: 'set', path: ['a'], value: JSON.parse('{"__proto__": {"x": 1}}') }],
    ['negative index', { op: 'move', path: ['rules'], from: -1, to: 0 }],
    ['fractional index', { op: 'insert', path: ['rules'], index: 1.5, value: 'x' }],
    ['control character', { op: 'set', path: ['a'], value: 'x\u0000' }],
    ['not plain data', { op: 'set', path: ['a'], value: new Date() }],
    ['infinite number', { op: 'set', path: ['a'], value: Infinity }],
    ['empty path for set', { op: 'set', path: [], value: 1 }],
    ['path not a list', { op: 'delete', path: 'rules' }],
  ];
  for (const [name, change] of bad) {
    it(`refuses: ${name}`, () => expect(() => validateChange(change)).toThrow(ChangeError));
  }

  it('refuses values nested too deeply', () => {
    let v: unknown = 'x';
    for (let i = 0; i < 40; i++) v = [v];
    expect(() => validateChange({ op: 'set', path: ['a'], value: v })).toThrow('value too big');
  });
});

describe('the saved settings file', () => {
  const s: Session = {
    app: 'stash',
    mode: 'advanced',
    source: { kind: 'file', name: 'my config.yaml' },
    original: fixture('configs/provider-basic.yaml'),
    changes: [
      { op: 'set', path: ['mode'], value: 'global' },
      { op: 'insert', path: ['rules'], index: 0, value: 'DOMAIN,example.net,DIRECT' },
    ],
  };

  it('restores the same session, and the same config', () => {
    const r = readSettings(writeSettings(s));
    if (!r.ok) throw new Error(r.error);
    expect(r.session).toEqual(s);
    expect(built(r.session).output).toBe(built(s).output);
  });

  const tamper = (edit: (f: Record<string, unknown>) => void) => {
    const f = JSON.parse(writeSettings(s)) as Record<string, unknown>;
    edit(f);
    return readSettings(JSON.stringify(f));
  };

  it('refuses files that are not settings', () => {
    expect(readSettings('not json')).toMatchObject({ ok: false, error: 'not-json' });
    expect(readSettings('[1]')).toMatchObject({ ok: false, error: 'not-settings' });
    expect(tamper((f) => (f['format'] = 'other'))).toMatchObject({ error: 'not-settings' });
  });

  it('asks for an update when the file is newer', () => {
    expect(tamper((f) => (f['version'] = 99))).toMatchObject({ error: 'newer-version' });
  });

  it('refuses damaged fields', () => {
    expect(tamper((f) => (f['app'] = 'clash-premium'))).toMatchObject({ error: 'bad-field', detail: 'app' });
    expect(tamper((f) => (f['mode'] = 'expert'))).toMatchObject({ error: 'bad-field', detail: 'mode' });
    expect(tamper((f) => (f['source'] = { kind: 'url', url: 'javascript:alert(1)' }))).toMatchObject({
      error: 'bad-field',
      detail: 'source',
    });
    expect(tamper((f) => (f['changes'] = 'x'))).toMatchObject({ error: 'bad-field', detail: 'changes' });
  });

  it('refuses a bad change, saying which', () => {
    expect(tamper((f) => ((f['changes'] as unknown[]).push({ op: 'set', path: ['__proto__'], value: 1 })))).toMatchObject({
      error: 'bad-change',
      detail: '3',
    });
  });

  it('runs the original through the safety checks again', () => {
    expect(tamper((f) => (f['original'] = fixture('hostile/python-tag.yaml')))).toMatchObject({
      error: 'bad-original',
      detail: 'tags',
    });
  });

  it('says what it is', () => {
    expect(JSON.parse(writeSettings(s)).format).toBe(SETTINGS_FORMAT);
  });
});

describe('new top-level settings', () => {
  it('go above the servers, groups and rules', () => {
    const s = session('configs/indentless.yaml', [{ op: 'set', path: ['ipv6'], value: false }]);
    const keys = Object.keys(built(s).doc.toJS());
    expect(keys.indexOf('ipv6')).toBeLessThan(keys.indexOf('proxies'));
    expect(keys.slice(0, 3)).toEqual(['mixed-port', 'mode', 'ipv6']);
  });
});
