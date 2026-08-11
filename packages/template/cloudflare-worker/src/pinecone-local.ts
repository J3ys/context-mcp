import { Pinecone } from '@pinecone-database/pinecone';

export interface PineconeWorkerEnvLike {
  PINECONE_MODE?: string;
  ENABLE_RERANK?: string;
  PINECONE_API_KEY?: string;
  PINECONE_CONTROLLER_HOST?: string;
}

export function isRerankEnabled(env: PineconeWorkerEnvLike): boolean {
  return (env.PINECONE_MODE ?? 'cloud') !== 'local' && env.ENABLE_RERANK !== 'false';
}

export async function getPineconeIndex(
  pinecone: Pinecone,
  indexName: string,
  mode: string | undefined
) {
  if (mode !== 'local') {
    return pinecone.index(indexName);
  }

  const description = await pinecone.describeIndex(indexName);
  const host = description.host.startsWith('http') ? description.host : `http://${description.host}`;
  return pinecone.index(indexName, host);
}

export function createPineconeClient(env: PineconeWorkerEnvLike): Pinecone {
  return (env.PINECONE_MODE ?? 'cloud') === 'local'
    ? new Pinecone({
        apiKey: env.PINECONE_API_KEY || 'pclocal',
        controllerHostUrl: env.PINECONE_CONTROLLER_HOST || 'http://pinecone:5080',
      })
    : new Pinecone({ apiKey: env.PINECONE_API_KEY || '' });
}
