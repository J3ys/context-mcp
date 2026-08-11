import { describe, it, expect, vi } from 'vitest';
import { getPineconeIndex, isRerankEnabled } from '../cloudflare-worker/src/pinecone-local.js';

describe('cloudflare worker local Pinecone handling', () => {
  it('disables rerank in local mode', () => {
    expect(isRerankEnabled({ PINECONE_MODE: 'local', ENABLE_RERANK: 'true' } as never)).toBe(false);
    expect(isRerankEnabled({ PINECONE_MODE: 'cloud', ENABLE_RERANK: 'true' } as never)).toBe(true);
    expect(isRerankEnabled({ PINECONE_MODE: 'cloud', ENABLE_RERANK: 'false' } as never)).toBe(false);
  });

  it('resolves the local per-index host before searching', async () => {
    const index = { query: vi.fn() };
    const pinecone = {
      index: vi.fn().mockReturnValue(index),
      describeIndex: vi.fn().mockResolvedValue({ host: 'pinecone:5081' }),
    };

    const resolved = await getPineconeIndex(pinecone as never, 'docs', 'local');

    expect(resolved).toBe(index);
    expect(pinecone.index).toHaveBeenCalledWith('docs', 'http://pinecone:5081');
  });
});
