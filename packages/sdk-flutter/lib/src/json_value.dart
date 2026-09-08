Object? normalizeJsonValue(Object? value, {String path = r'$'}) {
  if (value == null || value is String || value is bool || value is int) {
    return value;
  }
  if (value is double) {
    if (!value.isFinite) {
      throw ArgumentError.value(value, path, 'must be finite');
    }
    return value;
  }
  if (value is DateTime) return value.toUtc().toIso8601String();
  if (value is List<Object?>) {
    return <Object?>[
      for (var i = 0; i < value.length; i++)
        normalizeJsonValue(value[i], path: '$path[$i]'),
    ];
  }
  if (value is Map<Object?, Object?>) {
    final result = <String, Object?>{};
    for (final entry in value.entries) {
      if (entry.key is! String) {
        throw ArgumentError.value(entry.key, path, 'map keys must be strings');
      }
      final key = entry.key as String;
      result[key] = normalizeJsonValue(entry.value, path: '$path.$key');
    }
    return result;
  }
  throw ArgumentError.value(value, path, 'is not JSON-safe');
}

Map<String, Object?> normalizeProperties(Map<String, Object?>? properties) =>
    (normalizeJsonValue(properties ?? <String, Object?>{}) as Map<String, Object?>);
