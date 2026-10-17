'use client';

import React, { useState, useEffect, useRef, useId } from 'react';

export interface NodeItem {
  id: string;
  title: string;
  description?: string;
  countBadge?: string | number;
  status?: 'critical' | 'warning' | 'info' | 'healthy' | 'neutral';
  tags?: string[];
  meta?: string;
}

export interface ColumnGroup {
  id: string;
  title: string;
  subtitle?: string;
  nodes: NodeItem[];
}

export interface ConnectionFlow {
  fromId: string;
  toId: string;
  label?: string;
  volume?: number;
  status?: 'critical' | 'warning' | 'info' | 'healthy' | 'neutral';
  animated?: boolean;
}

export interface LegendItem {
  label: string;
  status: 'critical' | 'warning' | 'info' | 'healthy' | 'neutral';
  color: string;
  description?: string;
}

export interface SvgNodeFlowGraphProps {
  title?: string;
  subtitle?: string;
  columns: ColumnGroup[];
  connections: ConnectionFlow[];
  legends?: LegendItem[];
  className?: string;
  /** Smaller, quieter dashboard style: no pulsing, glow, or stat chips. */
  compact?: boolean;
}

interface PathCoords {
  fromId: string;
  toId: string;
  d: string;
  status: 'critical' | 'warning' | 'info' | 'healthy' | 'neutral';
  label?: string;
  volume?: number;
}

const STATUS_COLORS: Record<string, { stroke: string; glow: string; dot: string; text: string; bg: string }> = {
  critical: {
    stroke: '#ef4444',
    glow: '#f87171',
    dot: 'bg-red-500',
    text: 'text-red-500 dark:text-red-400',
    bg: 'bg-red-500/10 border-red-500/30'
  },
  warning: {
    stroke: '#eab308',
    glow: '#fde047',
    dot: 'bg-amber-500 dark:bg-yellow-500',
    text: 'text-amber-600 dark:text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/30'
  },
  info: {
    stroke: '#3b82f6',
    glow: '#60a5fa',
    dot: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30'
  },
  healthy: {
    stroke: '#10b981',
    glow: '#34d399',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30'
  },
  neutral: {
    stroke: '#64748b',
    glow: '#94a3b8',
    dot: 'bg-slate-500',
    text: 'text-slate-500 dark:text-slate-400',
    bg: 'bg-slate-500/10 border-slate-500/30'
  }
};

export function SvgNodeFlowGraph({
  title,
  subtitle,
  columns,
  connections,
  legends = [
    { label: 'CRITICAL', status: 'critical', color: '#ef4444', description: 'High error rate / alert' },
    { label: 'MEDIUM / WARN', status: 'warning', color: '#eab308', description: 'Elevated latency / warning' },
    { label: 'INFO', status: 'info', color: '#3b82f6', description: 'Standard traffic flow' },
    { label: 'HEALTHY', status: 'healthy', color: '#10b981', description: 'Optimal pipeline execution' }
  ],
  className = '',
  compact = false
}: SvgNodeFlowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paths, setPaths] = useState<PathCoords[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [activeFilterStatus, setActiveFilterStatus] = useState<string | null>(null);
  const filterId = useId().replace(/:/g, '');

  const calculatePaths = () => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newPaths: PathCoords[] = [];

    connections.forEach((conn) => {
      const sourceEl = nodeRefs.current[conn.fromId];
      const targetEl = nodeRefs.current[conn.toId];

      if (sourceEl && targetEl) {
        const sRect = sourceEl.getBoundingClientRect();
        const tRect = targetEl.getBoundingClientRect();

        // Right side of source card
        const x1 = sRect.right - containerRect.left;
        const y1 = sRect.top + sRect.height / 2 - containerRect.top;

        // Left side of target card
        const x2 = tRect.left - containerRect.left;
        const y2 = tRect.top + tRect.height / 2 - containerRect.top;

        // Calculate control points for smooth cubic bezier curve
        const deltaX = Math.max(Math.abs(x2 - x1) * 0.45, 40);
        const cx1 = x1 + deltaX;
        const cx2 = x2 - deltaX;

        const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;

        newPaths.push({
          fromId: conn.fromId,
          toId: conn.toId,
          d,
          status: conn.status || 'neutral',
          label: conn.label,
          volume: conn.volume
        });
      }
    });

    setPaths(newPaths);
  };

  useEffect(() => {
    calculatePaths();

    const handleResize = () => {
      calculatePaths();
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(calculatePaths);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    const timer = setTimeout(calculatePaths, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, [columns, connections]);

  // Compute connected nodes for highlight state
  const connectedNodeIds = React.useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    connections.forEach((c) => {
      if (c.fromId === hoveredNodeId) set.add(c.toId);
      if (c.toId === hoveredNodeId) set.add(c.fromId);
    });
    return set;
  }, [hoveredNodeId, connections]);

  const totalNodes = columns.reduce((sum, col) => sum + col.nodes.length, 0);
  const totalConnections = connections.length;
  const maxVolume = Math.max(...paths.map((path) => path.volume ?? 0), 1);

  return (
    <div
      className={
        compact
          ? `relative overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-100 dark:shadow-none ${className}`
          : `relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-sm dark:border-white/[0.08] dark:bg-[#000000] dark:text-zinc-100 ${className}`
      }
    >
      {/* Compact header */}
      {compact && (title || subtitle) && (
        <div className="border-b border-neutral-100 px-4 py-3 dark:border-slate-800">
          {title && <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      )}

      {/* Header */}
      {!compact && (title || subtitle) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-white/[0.08]">
          <div>
            {title && (
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
                <h3 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h3>
              </div>
            )}
            {subtitle && (
              <p className="mt-1 text-xs font-mono text-neutral-500 dark:text-zinc-400">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-neutral-600 dark:text-zinc-400">
            <span className="rounded bg-neutral-100 px-2.5 py-1 border border-neutral-200 text-neutral-700 dark:bg-zinc-900 dark:border-white/[0.08] dark:text-zinc-300">
              <strong className="text-neutral-900 dark:text-white">{columns.length}</strong> layers
            </span>
            <span className="rounded bg-neutral-100 px-2.5 py-1 border border-neutral-200 text-neutral-700 dark:bg-zinc-900 dark:border-white/[0.08] dark:text-zinc-300">
              <strong className="text-neutral-900 dark:text-white">{totalNodes}</strong> nodes
            </span>
            <span className="rounded bg-neutral-100 px-2.5 py-1 border border-neutral-200 text-neutral-700 dark:bg-zinc-900 dark:border-white/[0.08] dark:text-zinc-300">
              <strong className="text-cyan-600 dark:text-cyan-400">{totalConnections}</strong> dynamic flows
            </span>
          </div>
        </div>
      )}

      {/* Main Flow Container */}
      <div ref={containerRef} className={compact ? 'relative w-full p-4' : 'relative min-h-[460px] w-full py-4'}>
        {/* SVG Bezier Flow Layer - Only shown on large horizontal desktop view to prevent crossing lines on mobile */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible z-10 hidden lg:block">
          <defs>
            {/* Linear Gradients for Flow Lines */}
            <linearGradient id={`flow-grad-critical-${filterId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f87171" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="1" />
            </linearGradient>
            <linearGradient id={`flow-grad-warning-${filterId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fde047" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#eab308" stopOpacity="1" />
            </linearGradient>
            <linearGradient id={`flow-grad-info-${filterId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="1" />
            </linearGradient>
            <linearGradient id={`flow-grad-healthy-${filterId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
            </linearGradient>
            <linearGradient id={`flow-grad-neutral-${filterId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a1a1aa" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#71717a" stopOpacity="0.8" />
            </linearGradient>

            {/* Glow Filters */}
            <filter id={`glow-${filterId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Keyframe animation inline style */}
          <style>{`
            @keyframes svgDashFlow {
              0% { stroke-dashoffset: 24; }
              100% { stroke-dashoffset: 0; }
            }
            .animate-dash-flow {
              animation: svgDashFlow 1.6s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .animate-dash-flow {
                animation: none;
              }
            }
          `}</style>

          {/* Render Bezier Paths */}
          {paths.map((p, idx) => {
            const statusTheme = STATUS_COLORS[p.status] || STATUS_COLORS.neutral;
            const isConnectedToHover = hoveredNodeId
              ? p.fromId === hoveredNodeId || p.toId === hoveredNodeId
              : true;
            const isFilteredOut = activeFilterStatus && p.status !== activeFilterStatus;

            let opacity = compact ? 0.35 : 0.55;
            let strokeWidth = p.volume ? 1.5 + 4 * Math.sqrt(p.volume / maxVolume) : 2;

            if (hoveredNodeId) {
              if (isConnectedToHover) {
                opacity = 0.95;
                strokeWidth = 3;
              } else {
                opacity = 0.08;
              }
            } else if (isFilteredOut) {
              opacity = 0.08;
            }

            return (
              <g key={`${p.fromId}-${p.toId}-${idx}`}>
                <title>{p.label ?? (p.volume !== undefined ? `${p.volume.toLocaleString()} transitions` : 'Observed transition')}</title>
                {/* Base curve path */}
                <path
                  d={p.d}
                  fill="none"
                  stroke={`url(#flow-grad-${p.status}-${filterId})`}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  className="transition-all duration-300"
                />

                {/* Animated dash flow overlay */}
                {isConnectedToHover && !isFilteredOut && (!compact || hoveredNodeId) && (
                  <path
                    d={p.d}
                    fill="none"
                    stroke={statusTheme.glow}
                    strokeWidth={strokeWidth + 0.5}
                    strokeDasharray="6 10"
                    opacity={hoveredNodeId ? 0.95 : 0.75}
                    className="animate-dash-flow transition-all duration-300"
                    filter={compact ? undefined : `url(#glow-${filterId})`}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Card Columns Layout - Stretched Responsive Grid */}
        <div className={`svg-node-flow-columns relative z-20 grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${compact ? 'gap-4 lg:gap-10' : 'gap-6 lg:gap-8 xl:gap-10'}`}>
          {columns.map((col, colIdx) => (
            <div key={col.id} className={`flex min-w-0 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
              {/* Mobile Stage Connector Divider */}
              {colIdx > 0 && !compact && (
                <div className="flex lg:hidden items-center justify-center my-1">
                  <div className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-0.5 text-[11px] font-mono text-neutral-500 dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-400 shadow-xs">
                    <span className="text-emerald-500">↓</span>
                    <span>Pipeline Step {colIdx + 1}</span>
                  </div>
                </div>
              )}

              {/* Column Header */}
              <div className={compact ? 'mb-0.5' : 'mb-1 border-b border-neutral-200 pb-2 dark:border-white/[0.08]'}>
                <span
                  className={
                    compact
                      ? 'text-xs font-medium text-neutral-500 dark:text-slate-400'
                      : 'font-mono text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-zinc-400'
                  }
                >
                  {col.title}
                </span>
                {col.subtitle && !compact && (
                  <p className="text-[11px] font-mono text-neutral-400 dark:text-zinc-500 truncate">{col.subtitle}</p>
                )}
              </div>

              {/* Node Cards */}
              <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
                {col.nodes.map((node) => {
                  const nodeStatus = node.status || 'neutral';
                  const theme = STATUS_COLORS[nodeStatus];
                  const isHovered = hoveredNodeId === node.id;
                  const isConnected = connectedNodeIds ? connectedNodeIds.has(node.id) : true;
                  const isDimmed = hoveredNodeId && !isConnected;
                  const isFiltered = activeFilterStatus && nodeStatus !== activeFilterStatus;

                  return (
                    <div
                      key={node.id}
                      ref={(el) => {
                        nodeRefs.current[node.id] = el;
                      }}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      className={`group relative flex flex-col justify-between rounded-lg border transition-all duration-200 cursor-pointer ${compact ? 'px-3 py-2' : 'p-3.5'} ${
                        compact
                          ? isHovered
                            ? 'z-30 border-neutral-400 bg-white dark:border-slate-500 dark:bg-slate-900'
                            : isDimmed || isFiltered
                              ? 'border-neutral-200 bg-white opacity-30 dark:border-slate-800 dark:bg-slate-950'
                              : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
                          : isHovered
                          ? 'border-emerald-500 bg-white shadow-lg shadow-emerald-500/10 scale-[1.02] z-30 dark:border-white/30 dark:bg-zinc-900 dark:shadow-2xl'
                          : isDimmed || isFiltered
                          ? 'border-neutral-200/40 bg-neutral-50/40 opacity-25 dark:border-white/[0.04] dark:bg-zinc-950/40'
                          : 'border-neutral-200/90 bg-neutral-50/70 hover:border-neutral-300 hover:bg-neutral-100/90 dark:border-white/[0.08] dark:bg-zinc-900/70 dark:hover:border-white/[0.16] dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      {/* Top bar: Status dot & Count badge */}
                      <div className={`flex items-center justify-between gap-2 ${compact ? '' : 'mb-1.5'}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`shrink-0 rounded-full ${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${theme.dot} ${isHovered && !compact ? 'animate-ping' : ''}`} />
                          <span className="truncate font-mono text-xs font-semibold text-neutral-800 group-hover:text-neutral-900 dark:text-zinc-200 dark:group-hover:text-white">
                            {node.title}
                          </span>
                        </div>
                        {node.countBadge !== undefined && (
                          <span
                            className={
                              compact
                                ? 'shrink-0 text-[11px] tabular-nums text-neutral-500 dark:text-slate-400'
                                : 'shrink-0 rounded bg-neutral-200/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-neutral-700 border border-neutral-300/60 dark:bg-zinc-800/90 dark:text-zinc-300 dark:border-white/[0.08]'
                            }
                          >
                            {node.countBadge}
                          </span>
                        )}
                      </div>

                      {/* Description / Meta */}
                      {node.description && !compact && (
                        <p className="text-[11px] text-neutral-500 dark:text-zinc-400 line-clamp-2 mb-1 font-sans">
                          {node.description}
                        </p>
                      )}

                      {/* Footer tags / status pill */}
                      {(node.tags || node.meta) && !compact && (
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-neutral-400 dark:text-zinc-500">
                          {node.tags && (
                            <div className="flex flex-wrap gap-1">
                              {node.tags.map((tag, i) => (
                                <span key={i} className="rounded bg-white px-1.5 py-0.5 text-neutral-600 border border-neutral-200 dark:bg-zinc-950 dark:text-zinc-400 dark:border-white/[0.08]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {node.meta && <span className="ml-auto text-neutral-500 dark:text-zinc-400">{node.meta}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend & Filter Footer */}
      {compact && legends && legends.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 px-4 py-2.5 text-xs text-neutral-500 dark:border-slate-800 dark:text-slate-400">
          {legends.map((item) => {
            const theme = STATUS_COLORS[item.status] || STATUS_COLORS.neutral;
            const isActive = activeFilterStatus === item.status;
            return (
              <button
                key={item.status}
                type="button"
                onClick={() => setActiveFilterStatus(isActive ? null : item.status)}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 transition ${isActive ? 'font-medium text-neutral-900 dark:text-white' : 'hover:text-neutral-900 dark:hover:text-white'}`}
                title={item.description}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                {item.label.charAt(0) + item.label.slice(1).toLowerCase()}
              </button>
            );
          })}
          <span className="ml-auto hidden text-neutral-400 sm:inline dark:text-slate-500">Hover a node to trace its paths</span>
        </div>
      )}

      {!compact && legends && legends.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 text-xs font-mono text-neutral-600 dark:border-white/[0.08] dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-neutral-500 dark:text-zinc-500">Legend:</span>
            {legends.map((item) => {
              const theme = STATUS_COLORS[item.status] || STATUS_COLORS.neutral;
              const isActive = activeFilterStatus === item.status;

              return (
                <button
                  key={item.status}
                  onClick={() => setActiveFilterStatus(isActive ? null : item.status)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition border ${
                    isActive
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-zinc-800 dark:text-white dark:border-white/20'
                      : 'hover:bg-neutral-100 border-transparent text-neutral-600 dark:hover:bg-zinc-900 dark:text-zinc-400'
                  }`}
                  title={item.description}
                >
                  <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
                  <span className="font-medium text-[11px]">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-neutral-400 dark:text-zinc-500 italic">
            * Hover over nodes to inspect dynamic data flow
          </div>
        </div>
      )}
    </div>
  );
}
