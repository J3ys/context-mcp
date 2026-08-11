import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ContextMCPConfig, CodeGrammarEntry } from './schema.js';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GRAMMARS_DIR = path.join(PACKAGE_DIR, 'grammars');

const DEFAULT_CODE_GRAMMARS: Record<string, CodeGrammarEntry[]> = {
  java: [
    {
      extensions: ['.java'],
      wasmPath: path.join(GRAMMARS_DIR, 'tree-sitter-java.wasm'),
      astFlavor: 'java',
    },
  ],
  typescript: [
    {
      extensions: ['.ts'],
      wasmPath: path.join(GRAMMARS_DIR, 'tree-sitter-typescript.wasm'),
      astFlavor: 'web',
    },
    {
      extensions: ['.tsx'],
      wasmPath: path.join(GRAMMARS_DIR, 'tree-sitter-tsx.wasm'),
      astFlavor: 'web',
    },
    {
      extensions: ['.js', '.jsx'],
      wasmPath: path.join(GRAMMARS_DIR, 'tree-sitter-javascript.wasm'),
      astFlavor: 'web',
    },
  ],
  javascript: [
    {
      extensions: ['.js', '.jsx'],
      wasmPath: path.join(GRAMMARS_DIR, 'tree-sitter-javascript.wasm'),
      astFlavor: 'web',
    },
  ],
  python: [
    {
      extensions: ['.py'],
      wasmPath: path.join(GRAMMARS_DIR, 'tree-sitter-python.wasm'),
      astFlavor: 'python',
    },
  ],
};

export function getCodeGrammar(
  language: string | undefined,
  config?: Pick<ContextMCPConfig, 'codeGrammars'>
): CodeGrammarEntry[] | undefined {
  if (!language) return undefined;

  const overrides = config?.codeGrammars;
  if (overrides && overrides[language]) {
    return overrides[language];
  }

  return DEFAULT_CODE_GRAMMARS[language];
}
