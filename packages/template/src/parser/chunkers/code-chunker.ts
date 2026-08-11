/**
 * AST-aware code and config chunker for local repositories.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Parser, Language, type Node, type Tree } from 'web-tree-sitter';
import type { SourceConfig, CodeGrammarEntry } from '../../config/schema.js';
import type { DocChunk, ChunkConfig } from '../../types/index.js';
import { DEFAULT_CHUNK_CONFIG } from '../core/config.js';
import { getCodeGrammar } from '../../config/code-grammars.js';

interface SkipPatterns {
  skipDirs: string[];
  skipFiles: string[];
}

interface ExtractedDeclaration {
  kind: 'class' | 'method';
  name: string;
  enclosingClass?: string;
  startIndex: number;
  endIndex: number;
  startLine: number;
  endLine: number;
  mergeable: boolean;
}

interface GroupedChunk {
  content: string;
  heading: string;
  startLine: number;
  endLine: number;
}

interface ConfigChunk {
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
}

let parserInitialized = false;
const languageCache = new Map<string, Language>();

const MAX_WALK_DEPTH = 300;
const JAVA_CLASS_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
]);
const JAVA_METHOD_TYPES = new Set(['method_declaration', 'constructor_declaration']);
const WEB_CLASS_TYPES = new Set(['class_declaration']);
const WEB_METHOD_TYPES = new Set(['method_definition', 'function_declaration']);
const PYTHON_CLASS_TYPES = new Set(['class_definition']);
const PYTHON_METHOD_TYPES = new Set(['function_definition']);
const CONFIG_FILE_EXTENSIONS = new Set([
  '.yaml',
  '.yml',
  '.json',
  '.properties',
  '.sh',
  '.conf',
  '.cfg',
  '.ini',
  '.toml',
  '.xml',
  '.gradle',
  '.env',
]);
const CONFIG_FILE_NAMES = new Set([
  'dockerfile',
  '.dockerignore',
  '.gitignore',
  '.editorconfig',
  '.sdkmanrc',
  '.npmrc',
  '.nvmrc',
  '.tool-versions',
  'jenkinsfile',
  'makefile',
]);

async function ensureParserInitialized(): Promise<void> {
  if (!parserInitialized) {
    await Parser.init();
    parserInitialized = true;
  }
}

async function loadLanguage(wasmPath: string): Promise<Language> {
  const cached = languageCache.get(wasmPath);
  if (cached) return cached;

  await ensureParserInitialized();
  const language = await Language.load(wasmPath);
  languageCache.set(wasmPath, language);
  return language;
}

function findMatchingFiles(
  dir: string,
  skip: SkipPatterns,
  matcher: (entry: fs.Dirent, relativePath: string) => boolean,
  baseDir: string = dir
): string[] {
  const files: string[] = [];
  const skipDirsSet = new Set(skip.skipDirs.map(d => d.toLowerCase()));
  const skipFilesSet = new Set(skip.skipFiles.map(f => f.toLowerCase()));
  const stack: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.depth > MAX_WALK_DEPTH) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const subDirs: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (!skipDirsSet.has(entry.name.toLowerCase())) {
          subDirs.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (skipFilesSet.has(entry.name.toLowerCase())) continue;
      if (matcher(entry, relativePath)) {
        files.push(relativePath);
      }
    }

    for (let i = subDirs.length - 1; i >= 0; i--) {
      stack.push({ dir: subDirs[i], depth: current.depth + 1 });
    }
  }

  return files;
}

function findSourceFiles(
  dir: string,
  extensions: string[],
  skip: SkipPatterns,
  baseDir: string = dir
): string[] {
  const extensionSet = new Set(extensions.map(e => e.toLowerCase()));
  return findMatchingFiles(
    dir,
    skip,
    entry => extensionSet.has(path.extname(entry.name).toLowerCase()),
    baseDir
  );
}

function isConfigInfraFile(entry: fs.Dirent): boolean {
  const lowerName = entry.name.toLowerCase();
  if (CONFIG_FILE_NAMES.has(lowerName)) return true;
  if (lowerName.startsWith('.env')) return true;
  if (lowerName.endsWith('.dockerfile')) return true;
  return CONFIG_FILE_EXTENSIONS.has(path.extname(lowerName));
}

function findConfigInfraFiles(dir: string, skip: SkipPatterns, baseDir: string = dir): string[] {
  return findMatchingFiles(dir, skip, entry => isConfigInfraFile(entry), baseDir);
}

function isCommentNode(node: Node, astFlavor: 'java' | 'web' | 'python'): boolean {
  if (astFlavor === 'java') {
    return node.type === 'line_comment' || node.type === 'block_comment';
  }
  return node.type === 'comment';
}

function getDeclarationName(node: Node): string {
  const nameNode = node.childForFieldName('name');
  return nameNode?.text ?? 'anonymous';
}

function extractWebFunctionConst(node: Node): string | null {
  if (node.type !== 'lexical_declaration') return null;
  for (let i = 0; i < node.namedChildCount; i++) {
    const declarator = node.namedChild(i);
    if (!declarator || declarator.type !== 'variable_declarator') continue;
    const value = declarator.childForFieldName('value');
    if (!value) continue;
    if (value.type === 'arrow_function' || value.type === 'function_expression') {
      return declarator.childForFieldName('name')?.text ?? 'anonymous';
    }
  }
  return null;
}

function findLeadingCommentStart(node: Node, astFlavor: 'java' | 'web' | 'python'): number {
  let current = node.previousNamedSibling;
  let start = node.startIndex;

  while (current && isCommentNode(current, astFlavor)) {
    start = current.startIndex;
    current = current.previousNamedSibling;
  }

  return start;
}

function buildDeclaration(
  child: Node,
  unwrapped: Node,
  name: string,
  enclosingClass: string | undefined,
  astFlavor: 'java' | 'web' | 'python',
  isConstructor: boolean
): ExtractedDeclaration {
  const commentStart = findLeadingCommentStart(child, astFlavor);
  const hasLeadingComment = commentStart !== unwrapped.startIndex;

  return {
    kind: 'method',
    name,
    enclosingClass,
    startIndex: commentStart,
    endIndex: unwrapped.endIndex,
    startLine: unwrapped.startPosition.row + 1,
    endLine: unwrapped.endPosition.row + 1,
    mergeable: enclosingClass !== undefined && !hasLeadingComment && !isConstructor,
  };
}

function collectDeclarations(
  root: Node,
  astFlavor: 'java' | 'web' | 'python',
  granularity: 'method' | 'class',
  enclosingClass: string | undefined,
  out: ExtractedDeclaration[]
): void {
  const classTypes =
    astFlavor === 'java'
      ? JAVA_CLASS_TYPES
      : astFlavor === 'python'
        ? PYTHON_CLASS_TYPES
        : WEB_CLASS_TYPES;
  const methodTypes =
    astFlavor === 'java'
      ? JAVA_METHOD_TYPES
      : astFlavor === 'python'
        ? PYTHON_METHOD_TYPES
        : WEB_METHOD_TYPES;

  const worklist: { node: Node; enclosingClass: string | undefined }[] = [
    { node: root, enclosingClass },
  ];

  while (worklist.length > 0) {
    const current = worklist.pop();
    if (!current) continue;

    for (let i = 0; i < current.node.namedChildCount; i++) {
      const child = current.node.namedChild(i);
      if (!child) continue;

      const unwrapped =
        (astFlavor === 'web' && child.type === 'export_statement') ||
        (astFlavor === 'python' && child.type === 'decorated_definition')
          ? (child.namedChild(0) ?? child)
          : child;

      if (classTypes.has(unwrapped.type)) {
        const name = getDeclarationName(unwrapped);

        if (granularity === 'class') {
          const commentStart = findLeadingCommentStart(child, astFlavor);
          out.push({
            kind: 'class',
            name,
            startIndex: commentStart,
            endIndex: unwrapped.endIndex,
            startLine: unwrapped.startPosition.row + 1,
            endLine: unwrapped.endPosition.row + 1,
            mergeable: false,
          });
        } else {
          const qualifiedName = current.enclosingClass ? `${current.enclosingClass}.${name}` : name;
          const body = unwrapped.childForFieldName('body');
          if (body) {
            worklist.push({ node: body, enclosingClass: qualifiedName });
          }
        }
        continue;
      }

      if (granularity === 'method' && methodTypes.has(unwrapped.type)) {
        const name = getDeclarationName(unwrapped);
        const isConstructor =
          astFlavor === 'java'
            ? unwrapped.type === 'constructor_declaration'
            : astFlavor === 'python'
              ? name === '__init__'
              : name === 'constructor';
        out.push(
          buildDeclaration(child, unwrapped, name, current.enclosingClass, astFlavor, isConstructor)
        );
        continue;
      }

      if (granularity === 'method' && astFlavor === 'web') {
        const constFnName = extractWebFunctionConst(unwrapped);
        if (constFnName) {
          out.push(
            buildDeclaration(
              child,
              unwrapped,
              constFnName,
              current.enclosingClass,
              astFlavor,
              false
            )
          );
        }
      }
    }
  }
}

function buildHeading(decl: ExtractedDeclaration): string {
  if (decl.kind === 'class') return decl.name;
  return decl.enclosingClass ? `${decl.enclosingClass}.${decl.name}` : decl.name;
}

function mergeSmallDeclarations(
  declarations: ExtractedDeclaration[],
  source: string,
  chunkConfig: ChunkConfig
): GroupedChunk[] {
  const merged: GroupedChunk[] = [];
  let batch: ExtractedDeclaration[] = [];
  let batchSize = 0;

  const flush = () => {
    if (batch.length === 0) return;
    merged.push({
      content: batch.map(d => source.slice(d.startIndex, d.endIndex)).join('\n\n'),
      heading: batch.length === 1 ? buildHeading(batch[0]) : batch.map(buildHeading).join(', '),
      startLine: batch[0].startLine,
      endLine: batch[batch.length - 1].endLine,
    });
    batch = [];
    batchSize = 0;
  };

  for (const decl of declarations) {
    const size = decl.endIndex - decl.startIndex;
    if (!decl.mergeable || size >= chunkConfig.minChunkSize) {
      flush();
      merged.push({
        content: source.slice(decl.startIndex, decl.endIndex),
        heading: buildHeading(decl),
        startLine: decl.startLine,
        endLine: decl.endLine,
      });
      continue;
    }

    if (batchSize + size > chunkConfig.idealChunkSize) {
      flush();
    }
    batch.push(decl);
    batchSize += size;
  }

  flush();
  return merged;
}

function chunkConfigInfraFile(
  relativePath: string,
  content: string,
  chunkConfig: ChunkConfig
): ConfigChunk[] {
  if (content.trim().length === 0) {
    return [];
  }

  if (content.length <= chunkConfig.maxChunkSize) {
    return [
      {
        relativePath,
        content,
        startLine: 1,
        endLine: content.split('\n').length,
      },
    ];
  }

  const lines = content.split('\n');
  const chunks: ConfigChunk[] = [];
  let current: string[] = [];
  let currentLen = 0;
  let startLine = 1;

  const flush = (endLine: number) => {
    if (current.length === 0) return;
    const chunkContent = current.join('\n').trim();
    if (chunkContent.length >= chunkConfig.minChunkSize / 2) {
      chunks.push({ relativePath, content: chunkContent, startLine, endLine });
    }
    current = [];
    currentLen = 0;
    startLine = endLine + 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLen = currentLen + line.length + 1;
    if (current.length > 0 && nextLen > chunkConfig.maxChunkSize) {
      flush(i);
    }
    current.push(line);
    currentLen += line.length + 1;
  }

  flush(lines.length);
  return chunks;
}

export async function parseCodeSource(
  source: SourceConfig,
  localPath: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG,
  codeGrammars?: Record<string, CodeGrammarEntry[]>
): Promise<DocChunk[]> {
  const grammarSet = getCodeGrammar(source.language, { codeGrammars });
  if (!grammarSet) {
    throw new Error(
      `Source '${source.name}' has parser: code but language '${String(source.language)}' has no configured grammar`
    );
  }

  const allChunks: DocChunk[] = [];
  const granularity = source.codeGranularity ?? 'method';
  const contextName = source.displayName || source.name;

  for (const grammar of grammarSet) {
    const files = findSourceFiles(localPath, grammar.extensions, {
      skipDirs: source.skipDirs,
      skipFiles: source.skipFiles,
    });
    if (files.length === 0) continue;

    const language = await loadLanguage(grammar.wasmPath);
    const parser = new Parser();
    parser.setLanguage(language);

    try {
      for (const file of files) {
        const fullPath = path.join(localPath, file);
        let tree: Tree | null | undefined;

        try {
          const sourceText = fs.readFileSync(fullPath, 'utf-8');
          tree = parser.parse(sourceText);
          if (!tree) continue;

          const declarations: ExtractedDeclaration[] = [];
          collectDeclarations(tree.rootNode, grammar.astFlavor, granularity, undefined, declarations);

          const grouped =
            declarations.length === 0
              ? []
              : granularity === 'method'
                ? mergeSmallDeclarations(declarations, sourceText, chunkConfig)
                : declarations.map(d => ({
                    content: sourceText.slice(d.startIndex, d.endIndex),
                    heading: buildHeading(d),
                    startLine: d.startLine,
                    endLine: d.endLine,
                  }));

          const usable =
            grouped.length > 0
              ? grouped
              : sourceText.trim().length >= chunkConfig.minChunkSize
                ? [
                    {
                      content: sourceText,
                      heading: `${file} (whole file)`,
                      startLine: 1,
                      endLine: sourceText.split('\n').length,
                    },
                  ]
                : [];

          usable.forEach((chunk, index) => {
            allChunks.push({
              id: `${contextName}/${file}#${index}`,
              documentPath: `${contextName}/${file}`,
              documentTitle: `${contextName}/${file}`,
              category: 'code',
              heading: chunk.heading,
              content: chunk.content,
              metadata: {
                language: source.language,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
              },
            });
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[code-chunker] Skipping ${file}: ${reason}`);
        } finally {
          tree?.delete();
        }
      }
    } finally {
      parser.delete();
    }
  }

  const configFiles = findConfigInfraFiles(localPath, {
    skipDirs: source.skipDirs,
    skipFiles: source.skipFiles,
  });

  for (const file of configFiles) {
    const fullPath = path.join(localPath, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const configChunks = chunkConfigInfraFile(file, content, chunkConfig);
      configChunks.forEach((chunk, index) => {
        allChunks.push({
          id: `${contextName}/${file}#config-${index}`,
          documentPath: `${contextName}/${file}`,
          documentTitle: `${contextName}/${file}`,
          category: 'config',
          heading:
            configChunks.length === 1
              ? `${file} (config)`
              : `${file} (config part ${index + 1})`,
          content: chunk.content,
          metadata: {
            startLine: chunk.startLine,
            endLine: chunk.endLine,
          },
        });
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[code-chunker] Skipping ${file}: ${reason}`);
    }
  }

  return allChunks;
}
