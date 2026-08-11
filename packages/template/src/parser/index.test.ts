import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSource } from './index.js';
import type { SourceConfig } from '../config/schema.js';

describe('parseSource routing', () => {
  it('routes parser: code to the code chunker', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-source-code-'));
    fs.writeFileSync(
      path.join(dir, 'Foo.java'),
      'public class Foo {\n  public void bar() {\n    System.out.println("bar");\n  }\n}\n'
    );

    const source: SourceConfig = {
      name: 'foo',
      displayName: 'Foo',
      type: 'local',
      localPath: dir,
      branch: 'main',
      path: '.',
      parser: 'code',
      language: 'java',
      optional: false,
      skipDirs: [],
      skipFiles: [],
    } as SourceConfig;

    const chunks = await parseSource(source, {
      name: 'foo',
      displayName: 'Foo',
      localPath: dir,
      cleanup: () => {},
    });

    expect(chunks.some(c => c.heading === 'Foo.bar')).toBe(true);
  });
});
