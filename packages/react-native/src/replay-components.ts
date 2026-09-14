import { TraceIQReactNative } from './client';
import { ReplayNode, ReplayNodeKind } from './replay';

declare const require: (id: string) => any;

interface ScreenProps { screen: string; children?: unknown; style?: unknown }
interface RegionProps { id: number; kind: ReplayNodeKind; children?: unknown; style?: unknown }
interface Frame { x: number; y: number; width: number; height: number }
interface ScreenContext {
  blocked: boolean;
  register(node: ReplayNode): void;
  unregister(id: number): void;
  origin(): Frame | undefined;
  refreshers: Set<() => void>;
}

/**
 * Opt-in React Native views. They read layout only after replay authorization;
 * no text, accessibility label, props, image bytes, or input value is inspected.
 */
export function createReplayComponents(client: TraceIQReactNative) {
  const React = require('react');
  const { View } = require('react-native');
  const Context = React.createContext(null) as { Provider: any; _currentValue?: ScreenContext };

  function ReplayScreen({ screen, children, style }: ScreenProps) {
    const view = React.useRef(null) as { current: any };
    const root = React.useRef(undefined) as { current?: Frame };
    const currentScreen = React.useRef(screen) as { current: string };
    const screenChanged = currentScreen.current !== screen;
    currentScreen.current = screen;
    const nodes = React.useRef(new Map()) as { current: Map<number, ReplayNode> };
    if (screenChanged) { root.current = undefined; nodes.current.clear(); }
    const refreshers = React.useRef(new Set()) as { current: Set<() => void> };
    const pending = React.useRef(undefined) as { current?: ReturnType<typeof setTimeout> };

    const emit = () => {
      const frame = root.current;
      if (!frame || !client.isReplayRecording) return;
      const ordered = [...nodes.current.values()].sort((a, b) => a.id - b.id);
      client.recordReplaySnapshot(currentScreen.current, {
        width: frame.width, height: frame.height,
        orientation: frame.width > frame.height ? 'landscape' : 'portrait'
      }, [{ id: 0, kind: 'box', frame: { x: 0, y: 0, width: frame.width, height: frame.height } }, ...ordered]);
    };
    const scheduleEmit = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => { pending.current = undefined; emit(); }, 50);
    };
    const refresh = () => {
      if (!client.isReplayRecording || !view.current?.measureInWindow) return;
      view.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        if (!client.isReplayRecording) return;
        root.current = { x, y, width, height };
        scheduleEmit();
        refreshers.current.forEach((measure) => measure());
      });
    };

    React.useEffect(() => client.onReplayStateChange((recording) => {
      if (recording) refresh();
      else {
        if (pending.current) clearTimeout(pending.current);
        pending.current = undefined;
        root.current = undefined; nodes.current.clear();
      }
    }), []);
    React.useEffect(() => {
      client.clearReplaySnapshot();
      if (client.isReplayRecording) refresh();
      return () => {
        if (pending.current) clearTimeout(pending.current);
        pending.current = undefined;
        client.clearReplaySnapshot();
      };
    }, [screen]);

    const context: ScreenContext = {
      blocked: false,
      register(node) { if (client.isReplayRecording) { nodes.current.set(node.id, node); scheduleEmit(); } },
      unregister(id) { if (nodes.current.delete(id)) scheduleEmit(); },
      origin: () => root.current,
      refreshers: refreshers.current
    };
    const onTouchEnd = (event: any) => {
      const frame = root.current;
      const touch = event?.nativeEvent;
      if (frame && typeof touch?.pageX === 'number' && typeof touch?.pageY === 'number') {
        client.recordReplayTap(touch.pageX - frame.x, touch.pageY - frame.y);
      }
    };
    return React.createElement(Context.Provider, { value: context },
      React.createElement(View, { ref: view, style, onLayout: refresh, onTouchEnd }, children));
  }

  function ReplayRegion({ id, kind, children, style }: RegionProps) {
    const parent = React.useContext(Context) as ScreenContext | null;
    const view = React.useRef(null) as { current: any };
    const blocked = parent?.blocked || kind === 'blocked' || kind === 'input';
    const measure = () => {
      if (!parent || parent.blocked || !Number.isInteger(id) || id <= 0
        || !client.isReplayRecording || !view.current?.measureInWindow) return;
      view.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        const root = parent.origin();
        if (!root || !client.isReplayRecording) return;
        parent.register({ id, kind, frame: { x: x - root.x, y: y - root.y, width, height } });
      });
    };
    React.useEffect(() => {
      if (!parent || parent.blocked) return;
      parent.refreshers.add(measure);
      if (client.isReplayRecording) measure();
      return () => { parent.refreshers.delete(measure); parent.unregister(id); };
    }, [parent?.refreshers, id, kind, parent?.blocked]);
    const childContext = parent ? { ...parent, blocked } : null;
    return React.createElement(Context.Provider, { value: childContext },
      React.createElement(View, { ref: view, style, onLayout: measure }, children));
  }

  return { ReplayScreen, ReplayRegion };
}
