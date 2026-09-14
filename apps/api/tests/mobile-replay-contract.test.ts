import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { MOBILE_REPLAY_FORMAT_V1, mobileReplayV1SemanticErrors } from '../../../packages/types/src/mobile-replay';
import type { MobileReplayChunkV1 } from '../../../packages/types/src/mobile-replay';
import { mobileReplaySemanticErrors, validateMobileReplayChunk } from '../src/modules/replay/mobile-replay-validator';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../contracts/mobile-replay/fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const schema = JSON.parse(readFileSync(new URL('../../../contracts/mobile-replay/v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);

function expectValid(value: unknown): MobileReplayChunkV1 {
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  const chunk = value as MobileReplayChunkV1;
  expect(mobileReplayV1SemanticErrors(chunk)).toEqual([]);
  expect(mobileReplaySemanticErrors(chunk)).toEqual([]);
  expect(validateMobileReplayChunk(chunk, chunk.sequence)).toEqual(chunk);
  return chunk;
}

describe('mobile structural replay v1 contract', () => {
  it('accepts the React Native and Flutter fixtures', () => {
    expect(expectValid(fixture('valid-react-native')).format).toBe(MOBILE_REPLAY_FORMAT_V1);
    expect(expectValid(fixture('valid-flutter')).runtime).toBe('flutter');
  });

  it('rejects text values, image bytes, and unknown payload fields', () => {
    expect(validate(fixture('invalid-content'))).toBe(false);
    expect(validate(fixture('invalid-image'))).toBe(false);
    const extra = fixture('valid-flutter') as Record<string, unknown>;
    extra.userId = 'user_123';
    expect(validate(extra)).toBe(false);
  });

  it('rejects dynamic screen names and unknown event types', () => {
    const chunk = fixture('valid-flutter') as MobileReplayChunkV1;
    const snapshot = chunk.events[0] as Extract<MobileReplayChunkV1['events'][number], { type: 'snapshot' }>;
    snapshot.screen = 'Wallet for Emmanuel';
    expect(validate(chunk)).toBe(false);
    snapshot.screen = 'Wallet.Home';
    chunk.events[1] = { type: 'keystroke', timestamp: 1760000010100, value: 'secret' } as never;
    expect(validate(chunk)).toBe(false);
  });

  it('requires a leading snapshot and chronological events', () => {
    const chunk = expectValid(fixture('valid-react-native'));
    chunk.events.shift();
    expect(mobileReplayV1SemanticErrors(chunk)).toContain('Every chunk must begin with a snapshot.');
    expect(mobileReplaySemanticErrors(chunk)).toEqual(mobileReplayV1SemanticErrors(chunk));
    const reordered = expectValid(fixture('valid-react-native'));
    reordered.events[1].timestamp = reordered.events[0].timestamp - 1;
    expect(mobileReplayV1SemanticErrors(reordered)).toContain('events[1] timestamp is out of order.');
    expect(mobileReplaySemanticErrors(reordered)).toEqual(mobileReplayV1SemanticErrors(reordered));
  });

  it('rejects duplicate/orphan nodes, blocked descendants, and taps in blocked regions', () => {
    const duplicate = expectValid(fixture('valid-react-native'));
    const snapshot = duplicate.events[0] as Extract<MobileReplayChunkV1['events'][number], { type: 'snapshot' }>;
    snapshot.nodes[1].id = snapshot.nodes[0].id;
    expect(mobileReplayV1SemanticErrors(duplicate).join(' ')).toContain('duplicates an id');
    expect(mobileReplaySemanticErrors(duplicate)).toEqual(mobileReplayV1SemanticErrors(duplicate));

    const orphan = expectValid(fixture('valid-react-native'));
    const orphanSnapshot = orphan.events[0] as Extract<MobileReplayChunkV1['events'][number], { type: 'snapshot' }>;
    orphanSnapshot.nodes[1].parentId = 999;
    expect(mobileReplayV1SemanticErrors(orphan).join(' ')).toContain('parent must precede child');
    expect(mobileReplaySemanticErrors(orphan)).toEqual(mobileReplayV1SemanticErrors(orphan));

    const blockedChild = expectValid(fixture('valid-react-native'));
    const blockedSnapshot = blockedChild.events[0] as Extract<MobileReplayChunkV1['events'][number], { type: 'snapshot' }>;
    blockedSnapshot.nodes.push({ id: 4, parentId: 2, kind: 'text', frame: { x: 30, y: 150, width: 90, height: 20 } });
    expect(mobileReplayV1SemanticErrors(blockedChild).join(' ')).toContain('inside a blocked subtree');
    expect(mobileReplaySemanticErrors(blockedChild)).toEqual(mobileReplayV1SemanticErrors(blockedChild));

    const blockedTap = expectValid(fixture('valid-react-native'));
    blockedTap.events[1] = { type: 'tap', timestamp: 1760000000100, x: 40, y: 160 };
    expect(mobileReplayV1SemanticErrors(blockedTap).join(' ')).toContain('inside a blocked region');
    expect(mobileReplaySemanticErrors(blockedTap)).toEqual(mobileReplayV1SemanticErrors(blockedTap));
  });
});
