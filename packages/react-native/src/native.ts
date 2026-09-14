// Thin, optional access to React Native runtime APIs. We never hard-import
// `react-native` at the type level so this package typechecks on its own; the
// host app provides the real modules at runtime.

declare const require: (id: string) => unknown;

interface RNPlatform {
  OS?: string;
  Version?: string | number;
}

interface RNAppState {
  addEventListener?: (type: string, handler: (state: string) => void) => { remove?: () => void } | void;
}

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function safeRequire<T>(id: string): T | undefined {
  try {
    return require(id) as T;
  } catch {
    return undefined;
  }
}

const rn = safeRequire<{ Platform?: RNPlatform; AppState?: RNAppState }>('react-native');

export function getPlatform(): RNPlatform {
  return rn?.Platform ?? {};
}

/** Device info in the same shape the browser SDK sends. */
export function buildDeviceInfo(appVersion?: string): Record<string, unknown> {
  const platform = getPlatform();
  const os = platform.OS === 'ios' ? 'iOS' : platform.OS === 'android' ? 'Android' : platform.OS;
  return {
    platform: platform.OS ?? 'react-native',
    os,
    osVersion: platform.Version !== undefined ? String(platform.Version) : undefined,
    deviceType: platform.OS === 'ios' || platform.OS === 'android' ? 'mobile' : 'unknown',
    appVersion
  };
}

/** Subscribe to app background/foreground. Returns an unsubscribe fn (no-op if unavailable). */
export function onAppState(handler: (state: 'foreground' | 'background') => void): () => void {
  const appState = rn?.AppState;
  if (!appState?.addEventListener) {
    return () => undefined;
  }
  const subscription = appState.addEventListener('change', (state: string) => {
    if (state === 'background' || state === 'inactive') {
      handler('background');
    } else if (state === 'active') {
      handler('foreground');
    }
  });
  return () => {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove();
    }
  };
}

/** AsyncStorage-backed persistence for the anonymous id, degrading to in-memory. */
export function getAsyncStorage(): AsyncStorageLike | undefined {
  const mod = safeRequire<{ default?: AsyncStorageLike } & AsyncStorageLike>(
    '@react-native-async-storage/async-storage'
  );
  if (!mod) return undefined;
  return mod.default ?? mod;
}
