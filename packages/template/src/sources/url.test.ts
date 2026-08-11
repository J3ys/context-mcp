import { describe, it, expect } from 'vitest';
import { resolveUrlFilename, extractSeedLinks } from './url.js';

describe('resolveUrlFilename', () => {
  it('derives the filename from the URL basename when saveAs is absent', () => {
    expect(resolveUrlFilename('https://example.com/openapi.yaml')).toBe('openapi.yaml');
    expect(resolveUrlFilename('https://example.com/docs/spec.json')).toBe('spec.json');
  });

  it('falls back to content.yaml when the URL path has no basename', () => {
    expect(resolveUrlFilename('https://example.com/')).toBe('content.yaml');
    expect(resolveUrlFilename('https://example.com')).toBe('content.yaml');
  });

  it('uses saveAs verbatim to override the extension', () => {
    expect(resolveUrlFilename('https://example.com/llms-full.txt', 'llms-full.md')).toBe(
      'llms-full.md'
    );
  });

  it('rejects saveAs values containing path separators or traversal', () => {
    const url = 'https://example.com/x.txt';
    expect(() => resolveUrlFilename(url, '../escape.md')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, 'sub/dir.md')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, 'a\\b.md')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, '.')).toThrow(/must be a bare filename/);
    expect(() => resolveUrlFilename(url, '..')).toThrow(/must be a bare filename/);
  });

  it('rejects an empty or whitespace-only saveAs', () => {
    const url = 'https://example.com/x.txt';
    expect(() => resolveUrlFilename(url, '')).toThrow(/must not be empty/);
    expect(() => resolveUrlFilename(url, '   ')).toThrow(/must not be empty/);
  });

  it('allows consecutive dots inside an otherwise-bare filename', () => {
    expect(resolveUrlFilename('https://example.com/x.txt', 'llms..full.md')).toBe('llms..full.md');
  });
});

describe('extractSeedLinks', () => {
  const seed = `# Index
- [Payments](https://example.com/payments): accept payments.
- [Pricing](https://example.com/pricing).
- [Docs](https://docs.example.com/intro) external host.
- duplicate (https://example.com/payments)
- root link https://example.com/ and https://example.com
- [Case](https://example.com/case-studies/peerpush?utm=x#top)
`;

  it('extracts, dedupes and sorts apex links within the host allowlist', () => {
    expect(extractSeedLinks(seed, ['example.com'])).toEqual([
      'https://example.com/case-studies/peerpush',
      'https://example.com/payments',
      'https://example.com/pricing',
    ]);
  });

  it('excludes hosts outside the allowlist', () => {
    expect(extractSeedLinks(seed, ['example.com'])).not.toContain(
      'https://docs.example.com/intro'
    );
  });

  it('drops query, fragment, trailing slash and the bare host root', () => {
    const links = extractSeedLinks(seed, ['example.com']);
    expect(links).toContain('https://example.com/case-studies/peerpush');
    expect(links).not.toContain('https://example.com');
    expect(links).not.toContain('https://example.com/');
  });

  it('returns all hosts when the allowlist is empty', () => {
    expect(extractSeedLinks(seed)).toContain('https://docs.example.com/intro');
  });
});
