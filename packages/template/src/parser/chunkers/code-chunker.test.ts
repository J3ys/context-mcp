import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseCodeSource } from './code-chunker.js';
import { DEFAULT_CHUNK_CONFIG } from '../core/config.js';
import type { SourceConfig } from '../../config/schema.js';

const JAVA_FIXTURE = `package com.example;

public class Greeter {
    /**
     * Builds a greeting for the configured name.
     */
    public String greet() {
        return "Hello";
    }

    public String getName() {
        return "x";
    }

    public void setName(String name) {
    }
}
`;

const YAML_FIXTURE = `service:
  name: category-service
  url: http://category-service:8080

features:
  categoryTracing: true
`;

function writeFixture(dir: string, file: string, content: string): void {
  const fullPath = path.join(dir, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

function makeSource(overrides: Partial<SourceConfig> & { language: string }): SourceConfig {
  return {
    name: 'fixture',
    displayName: 'Fixture',
    type: 'local',
    branch: 'main',
    path: '.',
    parser: 'code',
    optional: false,
    skipDirs: [],
    skipFiles: [],
    ...overrides,
  } as SourceConfig;
}

describe('parseCodeSource', () => {
  it('extracts method-level chunks with attached Javadoc from a Java file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-chunker-java-'));
    writeFixture(dir, 'Greeter.java', JAVA_FIXTURE);

    const chunks = await parseCodeSource(
      makeSource({ language: 'java', localPath: dir }),
      dir,
      DEFAULT_CHUNK_CONFIG
    );

    const greet = chunks.find(c => c.heading === 'Greeter.greet');
    expect(greet).toBeDefined();
    expect(greet!.content).toContain('Builds a greeting for the configured name.');
    expect(greet!.metadata.language).toBe('java');
    expect(greet!.metadata.startLine).toBeGreaterThan(0);
    expect(greet!.metadata.endLine).toBeGreaterThan(greet!.metadata.startLine!);
  });

  it('indexes config and infra files alongside code from the same source', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-chunker-config-'));
    writeFixture(dir, 'Greeter.java', JAVA_FIXTURE);
    writeFixture(dir, 'deploy/values.yaml', YAML_FIXTURE);

    const chunks = await parseCodeSource(
      makeSource({ language: 'java', localPath: dir }),
      dir,
      DEFAULT_CHUNK_CONFIG
    );

    const valuesChunk = chunks.find(c => c.documentPath.endsWith('deploy/values.yaml'));
    expect(valuesChunk).toBeDefined();
    expect(valuesChunk!.category).toBe('config');
    expect(valuesChunk!.content).toContain('categoryTracing: true');
  });
});
