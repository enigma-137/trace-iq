import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/client.dart';
import 'package:traceiq_flutter/src/config.dart';
import 'package:traceiq_flutter/src/storage.dart';
import 'package:traceiq_flutter/src/transport.dart';

import '../test/test_support.dart';

void main() {
  test('complete pipeline posts canonical batch to a local HTTP server', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requests = <Map<String, Object?>>[];
    final serving = server.listen((request) async {
      expect(request.headers.value('x-traceiq-write-key'), 'write-key');
      requests.add(Map<String, Object?>.from(
        jsonDecode(await utf8.decoder.bind(request).join())
            as Map<Object?, Object?>,
      ));
      request.response.statusCode = HttpStatus.ok;
      request.response.write('{"accepted":true,"results":[{"accepted":true}]}');
      await request.response.close();
    }).asFuture<void>();
    final config = TraceIQConfig(
      projectId: 'project', apiKey: 'write-key', apiUrl: 'http://${server.address.host}:${server.port}',
      flushInterval: const Duration(hours: 1),
    );
    final client = TraceIQClient(
      config: config, storage: MemoryTraceIQStorage(), transport: HttpTraceIQTransport(config),
      clock: FakeClock(), uuid: FakeUuid(), metadataProvider: () async => <String, Object?>{},
    );
    await client.initialize();
    await client.identify('user_1', traits: <String, Object?>{'plan': 'pro'});
    await client.track('purchase', properties: <String, Object?>{'amount': 49});
    await client.flush();
    expect(client.queuedEventCount, 0);
    expect(requests.single['projectId'], 'project');
    final batch = requests.single['batch'] as List<Object?>;
    expect(batch, hasLength(2));
    expect((batch.first as Map<Object?, Object?>)['eventName'], r'$identify');
    await client.dispose();
    await server.close(force: true);
    await serving;
  });

  test('offline restart restores and later delivers event', () async {
    final storage = MemoryTraceIQStorage();
    final first = TraceIQClient(
      config: TraceIQConfig(projectId: 'p', apiKey: 'k', maxRetryCount: 0,
          flushInterval: const Duration(hours: 1)),
      storage: storage,
      transport: FakeTransport(<Object>[Exception('offline'), Exception('offline')]),
      clock: FakeClock(), uuid: FakeUuid(), metadataProvider: () async => <String, Object?>{},
    );
    await first.initialize();
    await first.track('saved');
    await first.flush();
    expect(first.queuedEventCount, 1);
    await first.dispose();

    final transport = FakeTransport();
    final restarted = TraceIQClient(
      config: TraceIQConfig(projectId: 'p', apiKey: 'k', flushInterval: const Duration(hours: 1)),
      storage: storage, transport: transport, clock: FakeClock(), uuid: FakeUuid(),
      metadataProvider: () async => <String, Object?>{},
    );
    await restarted.initialize();
    expect(restarted.queuedEventCount, 1);
    await restarted.flush();
    expect(restarted.queuedEventCount, 0);
    expect(transport.batches.single.single.eventName, 'saved');
    await restarted.dispose();
  });

  test('logout isolates user B from user A', () async {
    final transport = FakeTransport();
    final client = TraceIQClient(
      config: TraceIQConfig(projectId: 'p', apiKey: 'k', flushInterval: const Duration(hours: 1)),
      storage: MemoryTraceIQStorage(), transport: transport, clock: FakeClock(), uuid: FakeUuid(),
      metadataProvider: () async => <String, Object?>{},
    );
    await client.initialize();
    await client.identify('a');
    await client.track('a-event');
    await client.reset();
    await client.identify('b');
    await client.track('b-event');
    await client.flush();
    final bEvent = transport.batches.expand((batch) => batch).singleWhere((event) => event.eventName == 'b-event');
    expect(bEvent.userId, 'b');
    expect(bEvent.anonymousId, isNot(transport.batches.first.first.anonymousId));
    await client.dispose();
  });
}
