import { createHash, randomUUID } from 'node:crypto';

/** Deterministic Qdrant point UUID from clinic entity id (Qdrant requires UUID/uint ids). */
export function entityIdToPointUuid(entityId: string): string {
  const digest = createHash('sha1')
    .update('clinic-voice-ai:semantic-v1:')
    .update(entityId)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function aliasNameForIndex(
  collectionPrefix: string,
  indexId: string,
): string {
  const safe = indexId.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  return `${collectionPrefix}${safe}`;
}

export function physicalCollectionName(alias: string): string {
  return `${alias}__${randomUUID().replace(/-/g, '')}`;
}

export const ENTITY_ID_PAYLOAD_KEY = 'entityId';
export const TEXT_PAYLOAD_KEY = 'text';
