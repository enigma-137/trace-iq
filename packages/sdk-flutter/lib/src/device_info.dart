import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:package_info_plus/package_info_plus.dart';

Future<Map<String, Object?>> collectDeviceInfo() async {
  final info = <String, Object?>{
    'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
    'locale': WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag(),
    'timezone': DateTime.now().timeZoneName,
  };
  try {
    final package = await PackageInfo.fromPlatform();
    info.addAll(<String, Object?>{
      'appName': package.appName,
      'appVersion': package.version,
      'appBuildNumber': package.buildNumber,
      'packageName': package.packageName,
    });
  } catch (_) {
    // Package metadata is best effort on unsupported/test platforms.
  }
  return info;
}
