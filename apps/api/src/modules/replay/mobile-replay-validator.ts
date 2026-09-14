import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';

interface MobileFrame { x: number; y: number; width: number; height: number }
interface MobileNode { id: number; parentId?: number; kind: string; frame: MobileFrame }
interface MobileEvent {
  type: string; timestamp: number; x?: number; y?: number; nodes?: MobileNode[];
}
export interface ValidatedMobileReplayChunk {
  format: 'mobile-structural-v1'; version: 1; runtime: 'react-native' | 'flutter';
  platform: 'ios' | 'android'; sequence: number; events: MobileEvent[];
}

// Both src/modules/replay and dist/modules/replay are five levels below the
// monorepo root. The API image copies contracts/ alongside apps/ and packages/.
const schemaPath = resolve(__dirname, '../../../../../contracts/mobile-replay/v1.schema.json');
let validateSchema: ((value: unknown) => boolean) | undefined;

function schemaValidator() {
  if (!validateSchema) {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    validateSchema = new Ajv({ strict: true, allErrors: false }).compile(schema);
  }
  return validateSchema;
}

/** Reject content-bearing or structurally invalid mobile replay before storage. */
export function validateMobileReplayChunk(value: unknown, expectedSequence: number): ValidatedMobileReplayChunk {
  if (!schemaValidator()(value)) throw new BadRequestException('Mobile replay chunk does not match the v1 privacy schema.');
  const chunk = value as ValidatedMobileReplayChunk;
  if (chunk.sequence !== expectedSequence) throw new BadRequestException('Mobile replay chunk sequence does not match the request.');
  const semanticErrors = mobileReplaySemanticErrors(chunk);
  if (semanticErrors.length) throw new BadRequestException(`Mobile replay chunk is invalid: ${semanticErrors[0]}`);
  return chunk;
}

/** Mirrors the shared contract's non-schema invariants; conformance tests keep them in sync. */
export function mobileReplaySemanticErrors(chunk: ValidatedMobileReplayChunk): string[] {
  const errors: string[] = [];
  if (chunk.events[0]?.type !== 'snapshot') errors.push('Every chunk must begin with a snapshot.');
  let previousTimestamp = -1;
  let blockedFrames: MobileFrame[] = [];
  for (const [index, event] of chunk.events.entries()) {
    if (event.timestamp < previousTimestamp) errors.push(`events[${index}] timestamp is out of order.`);
    previousTimestamp = event.timestamp;
    if (event.type === 'tap' || event.type === 'scroll') {
      if (blockedFrames.some((frame) => event.x! >= frame.x && event.x! <= frame.x + frame.width
        && event.y! >= frame.y && event.y! <= frame.y + frame.height)) {
        errors.push(`events[${index}] interaction falls inside a blocked region.`);
      }
    }
    if (event.type !== 'snapshot') continue;
    const seen = new Set<number>();
    const blocked = new Set<number>();
    blockedFrames = [];
    for (const [nodeIndex, node] of (event.nodes ?? []).entries()) {
      if (seen.has(node.id)) errors.push(`events[${index}].nodes[${nodeIndex}] duplicates an id.`);
      if (node.parentId !== undefined && !seen.has(node.parentId)) {
        errors.push(`events[${index}].nodes[${nodeIndex}] parent must precede child.`);
      }
      if (node.parentId !== undefined && blocked.has(node.parentId)) {
        errors.push(`events[${index}].nodes[${nodeIndex}] is inside a blocked subtree.`);
      }
      seen.add(node.id);
      if (node.kind === 'blocked') blockedFrames.push(node.frame);
      if (node.kind === 'blocked' || (node.parentId !== undefined && blocked.has(node.parentId))) blocked.add(node.id);
    }
  }
  return errors;
}
