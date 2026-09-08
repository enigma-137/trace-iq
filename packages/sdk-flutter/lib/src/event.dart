import 'json_value.dart';

final class TraceIQEvent {
  TraceIQEvent({
    required this.queueId,
    required this.eventName,
    required this.timestamp,
    required this.anonymousId,
    required this.sessionId,
    required Map<String, Object?> properties,
    required Map<String, Object?> context,
    required Map<String, Object?> deviceInfo,
    this.userId,
  })  : properties = normalizeProperties(properties),
        context = normalizeProperties(context),
        deviceInfo = normalizeProperties(deviceInfo);

  final String queueId;
  final String eventName;
  final DateTime timestamp;
  final String anonymousId;
  final String? userId;
  final String sessionId;
  final Map<String, Object?> properties;
  final Map<String, Object?> context;
  final Map<String, Object?> deviceInfo;

  Map<String, Object?> toIngestionJson() => <String, Object?>{
        'eventName': eventName,
        'anonymousId': anonymousId,
        if (userId != null) 'userId': userId,
        'sessionId': sessionId,
        'properties': properties,
        'context': context,
        if (deviceInfo.isNotEmpty) 'deviceInfo': deviceInfo,
        'timestamp': timestamp.toUtc().toIso8601String(),
      };

  Map<String, Object?> toStorageJson() => <String, Object?>{
        'queueId': queueId,
        ...toIngestionJson(),
      };

  static TraceIQEvent fromStorageJson(Map<String, Object?> json) => TraceIQEvent(
        queueId: json['queueId']! as String,
        eventName: json['eventName']! as String,
        timestamp: DateTime.parse(json['timestamp']! as String).toUtc(),
        anonymousId: json['anonymousId']! as String,
        userId: json['userId'] as String?,
        sessionId: json['sessionId']! as String,
        properties: Map<String, Object?>.from(
          json['properties']! as Map<Object?, Object?>,
        ),
        context: Map<String, Object?>.from(
          json['context']! as Map<Object?, Object?>,
        ),
        deviceInfo: json['deviceInfo'] == null
            ? <String, Object?>{}
            : Map<String, Object?>.from(
                json['deviceInfo']! as Map<Object?, Object?>,
              ),
      );
}
