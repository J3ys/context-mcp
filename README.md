# ContextMCP

<p align="left">
  <a href="https://discord.gg/bYqAp4ayYh">
    <img src="https://img.shields.io/discord/1305511580854779984?label=Join%20Discord&logo=discord" alt="Join Discord" />
  </a>
</p>

**Self-hosted MCP server for local project code and documentation.** Index your code, documentation, APIs, and SDKs and serve them via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and REST API.

## Quick Start

```bash
# Scaffold a new project
npx contextmcp init my-docs-mcp

# Follow the prompts, then:
cd my-docs-mcp
npm install

# Configure your API keys
cp .env.example .env
# Edit .env with your PINECONE_API_KEY and an embedding provider key
# (OPENAI_API_KEY for provider: openai, or GEMINI_API_KEY for provider: gemini)

# Configure your code and documentation sources
# Edit config.yaml

# Index your project context
npm run reindex

# Edit the cloudflare-worker
# Deploy the MCP server
cd cloudflare-worker
npm install
npm run deploy
```

## What is ContextMCP?

ContextMCP creates a searchable knowledge base from your local project code and documentation that AI assistants can query via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

### Supported Content Types

| Parser     | Content Types         | Examples                            |
| ---------- | --------------------- | ----------------------------------- |
| `mdx`      | MDX/JSX documentation | Mintlify, Fumadocs, Docusaurus      |
| `markdown` | Plain Markdown files  | READMEs, CHANGELOGs                 |
| `openapi`  | OpenAPI/Swagger specs | API reference docs                  |
| `html`     | Raw HTML pages        | exported docs pages, static sites   |
| `code`     | Source code           | TypeScript, JavaScript, Java, Python |

### How It Works

1. **Parse** - Extract content from your code, docs, APIs, and READMEs
2. **Chunk** - Split into semantic chunks optimized for search
3. **Embed** - Generate embeddings using OpenAI or Gemini
4. **Store** - Upload to Pinecone vector database
5. **Search** - Query via MCP from AI assistants

## Ecosystem

### Add a chat UI with ContextChat

ContextMCP serves retrieval; pair it with a chat UI such as ContextChat to give your docs or internal tools a drop-in, embeddable "Ask AI" experience. A companion chat worker can query your ContextMCP `/search` endpoint and stream answers with inline citations.

## Repository Structure

```
contextmcp/
├── packages/
│   ├── cli/              # npx contextmcp (npm package)
│   ├── template/         # Project template (scaffolded to users)
│   └── website/          # contextmcp.ai documentation site
└── deployments/
    └── example/          # Example deployment
```

## Packages

| Package             | Description          | Published            |
| ------------------- | -------------------- | -------------------- |
| `packages/cli`      | CLI scaffolding tool | ✅ npm: `contextmcp` |
| `packages/template` | Project template     | (copied by CLI)      |
| `packages/website`  | Documentation site   | (deployed to Vercel) |

## Development

### Prerequisites

- Node.js 18+

### Setup

```bash
# Install all dependencies
npm install

# Development
npm run dev:website     # Run website locally
npm run dev:cli         # Watch CLI for changes

# Build
npm run build:website   # Build website
npm run build:cli       # Build CLI

# Type checking
npm run typecheck       # Check all packages
```

## Documentation

Visit [contextmcp.ai/docs](https://contextmcp.ai/docs) for full documentation.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
