import 'dart:async';

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/widgets.dart';

import '../traceiq_flutter.dart';

/// Wrap a screen after TraceIQ.initialize. Only opted-in ReplayRegions appear
/// in the replay; text, widget properties, and images are never inspected.
class TraceIQReplayScreen extends StatefulWidget {
  const TraceIQReplayScreen({super.key, required this.screen, required this.child});
  final String screen;
  final Widget child;

  @override
  State<TraceIQReplayScreen> createState() => _TraceIQReplayScreenState();
}

class _TraceIQReplayScreenState extends State<TraceIQReplayScreen> {
  final GlobalKey<State<StatefulWidget>> _key = GlobalKey<State<StatefulWidget>>();
  late final ValueListenable<bool> _recording;
  final Map<int, TraceIQReplayNode> _nodes = <int, TraceIQReplayNode>{};
  final Set<VoidCallback> _measurers = <VoidCallback>{};
  Timer? _emitTimer;
  Offset? _origin;
  Size? _size;
  Offset? _lastPointer;
  Offset? _pointerDown;
  bool _dragged = false;

  @override
  void initState() {
    super.initState();
    _recording = TraceIQ.replayRecording;
    _recording.addListener(_onRecordingChanged);
    _scheduleMeasure();
  }

  @override
  void didUpdateWidget(covariant TraceIQReplayScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.screen != widget.screen) {
      _nodes.clear();
      _origin = null;
      TraceIQ.clearReplaySnapshot();
      _scheduleMeasure();
    }
  }

  @override
  void dispose() {
    _recording.removeListener(_onRecordingChanged);
    _emitTimer?.cancel();
    TraceIQ.clearReplaySnapshot();
    super.dispose();
  }

  void _onRecordingChanged() {
    if (TraceIQ.isReplayRecording) {
      _scheduleMeasure();
    } else {
      _emitTimer?.cancel();
      _emitTimer = null;
      _nodes.clear();
      _origin = null;
      _size = null;
      _lastPointer = null;
      _pointerDown = null;
    }
  }

  void _scheduleMeasure() {
    if (!TraceIQ.isReplayRecording) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !TraceIQ.isReplayRecording) return;
      final box = _key.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.hasSize) return;
      _origin = box.localToGlobal(Offset.zero);
      _size = box.size;
      for (final measure in _measurers.toList()) { measure(); }
      _scheduleEmit();
    });
    WidgetsBinding.instance.scheduleFrame();
  }

  void _scheduleEmit() {
    if (_emitTimer != null || !TraceIQ.isReplayRecording) return;
    _emitTimer = Timer(const Duration(milliseconds: 50), () {
      _emitTimer = null;
      if (!mounted || !TraceIQ.isReplayRecording || _size == null) return;
      final nodes = _nodes.values.toList()..sort((a, b) => a.id.compareTo(b.id));
      TraceIQ.recordReplaySnapshot(widget.screen, _size!, <TraceIQReplayNode>[
        TraceIQReplayNode(id: 0, kind: TraceIQReplayKind.box, frame: Offset.zero & _size!),
        ...nodes,
      ]);
    });
  }

  void register(TraceIQReplayNode node) {
    if (!mounted || !TraceIQ.isReplayRecording) return;
    _nodes[node.id] = node;
    TraceIQ.clearReplaySnapshot();
    _scheduleEmit();
  }

  void unregister(int id) {
    if (!mounted) return;
    if (_nodes.remove(id) != null) {
      TraceIQ.clearReplaySnapshot();
      _scheduleEmit();
    }
  }

  @override
  Widget build(BuildContext context) {
    _scheduleMeasure();
    return _ReplayScope(
      screen: this,
      blocked: false,
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          final point = _lastPointer;
          if (point != null && notification is ScrollUpdateNotification && notification.scrollDelta != null) {
            final delta = notification.scrollDelta!;
            TraceIQ.recordReplayScroll(point,
              notification.metrics.axis == Axis.horizontal ? Offset(delta, 0) : Offset(0, delta));
          }
          return false;
        },
        child: Listener(
          onPointerDown: (event) {
            _lastPointer = _origin == null ? null : event.position - _origin!;
            _pointerDown = _lastPointer;
            _dragged = false;
          },
          onPointerMove: (event) {
            final start = _pointerDown;
            if (start != null && _origin != null && (event.position - _origin! - start).distance > 12) _dragged = true;
          },
          onPointerUp: (event) {
            if (_origin != null && !_dragged) TraceIQ.recordReplayTap(event.position - _origin!);
            _lastPointer = null;
            _pointerDown = null;
          },
          onPointerCancel: (_) { _lastPointer = null; _pointerDown = null; },
          child: SizedBox(key: _key, child: widget.child),
        ),
      ),
    );
  }
}

class _ReplayScope extends InheritedWidget {
  const _ReplayScope({required this.screen, required this.blocked, required super.child});
  final _TraceIQReplayScreenState screen;
  final bool blocked;

  static _ReplayScope? maybeOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<_ReplayScope>();
  @override
  bool updateShouldNotify(_ReplayScope oldWidget) => screen != oldWidget.screen || blocked != oldWidget.blocked;
}

/// Mark a content-free region. Use [TraceIQReplayKind.blocked] for payments,
/// credentials, personal data, embedded/native views, and unknown third parties.
class TraceIQReplayRegion extends StatefulWidget {
  const TraceIQReplayRegion({super.key, required this.id, required this.kind, required this.child});
  final int id;
  final TraceIQReplayKind kind;
  final Widget child;

  @override
  State<TraceIQReplayRegion> createState() => _TraceIQReplayRegionState();
}

class _TraceIQReplayRegionState extends State<TraceIQReplayRegion> {
  final GlobalKey<State<StatefulWidget>> _key = GlobalKey<State<StatefulWidget>>();
  _ReplayScope? _scope;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scope = _ReplayScope.maybeOf(context);
    if (_scope?.screen != scope?.screen || _scope?.blocked != scope?.blocked) {
      _scope?.screen._measurers.remove(_measure);
      _scope?.screen.unregister(widget.id);
      _scope = scope;
      if (scope != null && !scope.blocked) scope.screen._measurers.add(_measure);
    }
    _scheduleMeasure();
  }

  @override
  void didUpdateWidget(covariant TraceIQReplayRegion oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id || oldWidget.kind != widget.kind) {
      _scope?.screen.unregister(oldWidget.id);
    }
    _scheduleMeasure();
  }

  @override
  void dispose() {
    _scope?.screen._measurers.remove(_measure);
    _scope?.screen.unregister(widget.id);
    super.dispose();
  }

  void _scheduleMeasure() {
    if (!TraceIQ.isReplayRecording) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _measure();
    });
    WidgetsBinding.instance.scheduleFrame();
  }

  void _measure() {
    final scope = _scope;
    if (scope == null || scope.blocked || !TraceIQ.isReplayRecording || widget.id <= 0) return;
    final origin = scope.screen._origin;
    final box = _key.currentContext?.findRenderObject();
    if (origin == null || box is! RenderBox || !box.hasSize) return;
    final position = box.localToGlobal(Offset.zero) - origin;
    scope.screen.register(TraceIQReplayNode(
      id: widget.id, kind: widget.kind, frame: position & box.size,
    ));
  }

  @override
  Widget build(BuildContext context) {
    _scheduleMeasure();
    final scope = _scope;
    return _ReplayScope(
      screen: scope?.screen ?? (throw StateError('TraceIQReplayRegion must be inside TraceIQReplayScreen.')),
      blocked: scope!.blocked || widget.kind == TraceIQReplayKind.blocked || widget.kind == TraceIQReplayKind.input,
      child: SizedBox(key: _key, child: widget.child),
    );
  }
}
