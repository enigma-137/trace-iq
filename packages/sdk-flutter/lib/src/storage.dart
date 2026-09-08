import 'package:shared_preferences/shared_preferences.dart';

abstract interface class TraceIQStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

final class SharedPreferencesTraceIQStorage implements TraceIQStorage {
  SharedPreferencesTraceIQStorage(this._preferences);
  final SharedPreferencesAsync _preferences;

  static SharedPreferencesTraceIQStorage create() =>
      SharedPreferencesTraceIQStorage(SharedPreferencesAsync());

  @override
  Future<String?> read(String key) => _preferences.getString(key);
  @override
  Future<void> write(String key, String value) async {
    await _preferences.setString(key, value);
  }
  @override
  Future<void> delete(String key) async {
    await _preferences.remove(key);
  }
}

final class MemoryTraceIQStorage implements TraceIQStorage {
  final Map<String, String> values = <String, String>{};
  @override
  Future<void> delete(String key) async => values.remove(key);
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
}
