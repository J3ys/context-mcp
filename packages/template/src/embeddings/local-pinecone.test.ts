import { describe, it, expect, vi } from 'vitest';
import { getPineconeIndex, shouldUseLocalPinecone } from './core.js';

describe('local Pinecone helpers', () => {
  it('keeps cloud mode on the direct index handle', async () => {
    const index = { query: vi.fn() };
    const pinecone = {
      index: vi.fn().mockReturnValue(index),
      describeIndex: vi.fn(),
    };

    const resolved = await getPineconeIndex(pinecone as never, 'docs', 'cloud');

    expect(resolved).toBe(index);
    expect(pinecone.index).toHaveBeenCalledWith('docs');
    expect(pinecone.describeIndex).not.toHaveBeenCalled();
  });

  it('resolves the per-index host in local mode', async () => {
    const index = { query: vi.fn() };
    const pinecone = {
      index: vi.fn().mockReturnValue(index),
      describeIndex: vi.fn().mockResolvedValue({ host: '127.0.0.1:5081' }),
    };

    const resolved = await getPineconeIndex(pinecone as never, 'docs', 'local');

    expect(resolved).toBe(index);
    expect(pinecone.describeIndex).toHaveBeenCalledWith('docs');
    expect(pinecone.index).toHaveBeenCalledWith('docs', 'http://127.0.0.1:5081');
  });

  it('treats only local mode as local Pinecone', () => {
    expect(shouldUseLocalPinecone('local')).toBe(true);
    expect(shouldUseLocalPinecone('cloud')).toBe(false);
    expect(shouldUseLocalPinecone(undefined)).toBe(false);
  });
});
