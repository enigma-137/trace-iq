import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { EventsController } from '../src/modules/events/events.controller';

function routes(controller: { prototype: object }) {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
    .map((name) => ({
      handler: name,
      method: Reflect.getMetadata(METHOD_METADATA, proto[name]) as RequestMethod | undefined,
      path: Reflect.getMetadata(PATH_METADATA, proto[name]) as string | undefined
    }))
    .filter((route) => route.method !== undefined);
}

describe('public events routes (write-key authenticated)', () => {
  it('only accepts ingestion: a public write key can never read events back', () => {
    const registered = routes(EventsController);
    expect(registered.map((route) => [RequestMethod[route.method as RequestMethod], route.path])).toEqual([
      ['POST', '/'],
      ['POST', 'batch']
    ]);
    expect(registered.some((route) => route.method === RequestMethod.GET)).toBe(false);
  });
});
