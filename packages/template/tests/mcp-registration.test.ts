import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerTool = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    registerTool = registerTool;

    constructor(_config: unknown) {}
  },
}));

vi.mock('agents/mcp', () => ({
  McpAgent: class {
    env: Record<string, string>;

    constructor(env: Record<string, string> = {}) {
      this.env = env;
    }

    static serve(_path: string) {
      return { fetch: vi.fn() };
    }
  },
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {},
}));

vi.mock('openai', () => ({
  default: class {},
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {},
}));

vi.mock('../cloudflare-worker/src/pinecone-local.js', () => ({
  createPineconeClient: vi.fn(() => ({})),
  getPineconeIndex: vi.fn(),
  isRerankEnabled: vi.fn(() => false),
}));

describe('template MCP registration', () => {
  beforeEach(() => {
    registerTool.mockReset();
  });

  it('registers the project-context search tool with the new default description', async () => {
    const { ContextMCP } = await import('../cloudflare-worker/src/index.js');
    const agent = new ContextMCP({} as never);

    await agent.init();

    expect(registerTool).toHaveBeenCalledWith(
      'search_project_context',
      expect.objectContaining({
        title: 'Search contextmcp Project Context',
        description: 'Semantic search across code and documentation in local projects',
      }),
      expect.any(Function)
    );
  });

  it('registers the generalized example deployment with the project-context tool name', async () => {
    const { ExampleProjectMCP } = await import('../../../deployments/example/cloudflare-worker/src/index.ts');
    const agent = new ExampleProjectMCP({} as never);

    await agent.init();

    expect(registerTool).toHaveBeenCalledWith(
      'search_project_context',
      expect.objectContaining({
        title: 'Search Example Project Context',
        description:
          'Search the Example Project code and documentation using semantic search across docs, APIs, SDKs, and code repositories.',
      }),
      expect.any(Function)
    );
  });
});
