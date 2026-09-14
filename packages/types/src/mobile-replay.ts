/** Versioned, content-free mobile replay payload shared by the API and SDKs. */
export const MOBILE_REPLAY_FORMAT_V1 = 'mobile-structural-v1' as const;

export interface MobileReplayFrameV1 {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MobileReplayNodeV1 {
  id: number;
  parentId?: number;
  kind: 'box' | 'text' | 'image' | 'icon' | 'input' | 'control' | 'blocked';
  frame: MobileReplayFrameV1;
}

export interface MobileReplayViewportV1 {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
}

export type MobileReplayEventV1 =
  | { type: 'snapshot'; timestamp: number; screen: string; viewport: MobileReplayViewportV1; nodes: MobileReplayNodeV1[] }
  | { type: 'tap'; timestamp: number; x: number; y: number }
  | { type: 'scroll'; timestamp: number; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'navigation'; timestamp: number; screen: string }
  | { type: 'lifecycle'; timestamp: number; state: 'foreground' | 'background' };

export interface MobileReplayChunkV1 {
  format: typeof MOBILE_REPLAY_FORMAT_V1;
  version: 1;
  runtime: 'react-native' | 'flutter';
  platform: 'ios' | 'android';
  sequence: number;
  events: MobileReplayEventV1[];
}

/** Semantic checks that JSON Schema cannot express. Run only after schema validation. */
export function mobileReplayV1SemanticErrors(chunk: MobileReplayChunkV1): string[] {
  const errors: string[] = [];
  if (chunk.events[0]?.type !== 'snapshot') errors.push('Every chunk must begin with a snapshot.');
  let previousTimestamp = -1;
  let blockedFrames: MobileReplayFrameV1[] = [];
  for (const [index, event] of chunk.events.entries()) {
    if (event.timestamp < previousTimestamp) errors.push(`events[${index}] timestamp is out of order.`);
    previousTimestamp = event.timestamp;
    if (event.type === 'tap' || event.type === 'scroll') {
      if (blockedFrames.some((frame) => event.x >= frame.x && event.x <= frame.x + frame.width
        && event.y >= frame.y && event.y <= frame.y + frame.height)) {
        errors.push(`events[${index}] interaction falls inside a blocked region.`);
      }
    }
    if (event.type !== 'snapshot') continue;

    const seen = new Set<number>();
    const blocked = new Set<number>();
    blockedFrames = [];
    for (const [nodeIndex, node] of event.nodes.entries()) {
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
