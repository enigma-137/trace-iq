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
  className = ''
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
    const timer = setTimeout(calculatePaths, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
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
    <div className={`relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:shadow-2xl ${className}`}>
      {/* Header */}
      {(title || subtitle) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-slate-800/80">
          <div>
            {title && (
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
                <h3 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h3>
              </div>
            )}
            {subtitle && (
              <p className="mt-1 text-xs font-mono text-neutral-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-neutral-600 dark:text-slate-400">
            <span className="rounded bg-neutral-100 px-2.5 py-1 border border-neutral-200 text-neutral-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300">
              <strong className="text-neutral-900 dark:text-white">{columns.length}</strong> layers
            </span>
            <span className="rounded bg-neutral-100 px-2.5 py-1 border border-neutral-200 text-neutral-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300">
              <strong className="text-neutral-900 dark:text-white">{totalNodes}</strong> nodes
            </span>
            <span className="rounded bg-neutral-100 px-2.5 py-1 border border-neutral-200 text-neutral-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300">
              <strong className="text-cyan-600 dark:text-cyan-400">{totalConnections}</strong> dynamic flows
            </span>
          </div>
        </div>
      )}

      {/* Main Flow Container */}
      <div ref={containerRef} className="relative min-h-[460px] w-full py-4">
        {/* SVG Bezier Flow Layer */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible z-10">
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
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#64748b" stopOpacity="0.8" />
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
          `}</style>

          {/* Render Bezier Paths */}
          {paths.map((p, idx) => {
            const statusTheme = STATUS_COLORS[p.status] || STATUS_COLORS.neutral;
            const isConnectedToHover = hoveredNodeId
              ? p.fromId === hoveredNodeId || p.toId === hoveredNodeId
              : true;
            const isFilteredOut = activeFilterStatus && p.status !== activeFilterStatus;

            let opacity = 0.55;
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
                {isConnectedToHover && !isFilteredOut && (
                  <path
                    d={p.d}
                    fill="none"
                    stroke={statusTheme.glow}
                    strokeWidth={strokeWidth + 0.5}
                    strokeDasharray="6 10"
                    opacity={hoveredNodeId ? 0.95 : 0.75}
                    className="animate-dash-flow transition-all duration-300"
                    filter={`url(#glow-${filterId})`}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Card Columns Layout */}
        <div className="relative z-20 grid h-full gap-8 md:grid-flow-col md:auto-cols-fr">
          {columns.map((col) => (
            <div key={col.id} className="flex flex-col gap-3">
              {/* Column Header */}
              <div className="mb-1 border-b border-neutral-200 pb-2 dark:border-slate-800/80">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-slate-400">
                  {col.title}
                </span>
                {col.subtitle && (
                  <p className="text-[11px] font-mono text-neutral-400 dark:text-slate-500">{col.subtitle}</p>
                )}
              </div>

              {/* Node Cards */}
              <div className="flex flex-col gap-3">
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
                      className={`group relative flex flex-col justify-between rounded-lg border p-3.5 transition-all duration-200 cursor-pointer ${
                        isHovered
                          ? 'border-cyan-500 bg-white shadow-lg shadow-cyan-500/10 scale-[1.02] z-30 dark:border-cyan-400/80 dark:bg-slate-900 dark:shadow-cyan-950/40'
                          : isDimmed || isFiltered
                          ? 'border-neutral-200/40 bg-neutral-50/40 opacity-30 dark:border-slate-800/40 dark:bg-slate-950/60'
                          : 'border-neutral-200/90 bg-neutral-50/70 hover:border-neutral-300 hover:bg-neutral-100/90 dark:border-slate-800/80 dark:bg-slate-900/80 dark:hover:border-slate-700 dark:hover:bg-slate-900'
                      }`}
                    >
                      {/* Top bar: Status dot & Count badge */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`h-2 w-2 rounded-full ${theme.dot} ${isHovered ? 'animate-ping' : ''}`} />
                          <span className="truncate font-mono text-xs font-semibold text-neutral-800 group-hover:text-neutral-900 dark:text-slate-200 dark:group-hover:text-white">
                            {node.title}
                          </span>
                        </div>
                        {node.countBadge !== undefined && (
                          <span className="shrink-0 rounded bg-neutral-200/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-neutral-700 border border-neutral-300/60 dark:bg-slate-800/90 dark:text-slate-300 dark:border-slate-700/50">
                            {node.countBadge}
                          </span>
                        )}
                      </div>

                      {/* Description / Meta */}
                      {node.description && (
                        <p className="text-[11px] text-neutral-500 dark:text-slate-400 line-clamp-2 mb-1 font-sans">
                          {node.description}
                        </p>
                      )}

                      {/* Footer tags / status pill */}
                      {(node.tags || node.meta) && (
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-neutral-400 dark:text-slate-500">
                          {node.tags && (
                            <div className="flex flex-wrap gap-1">
                              {node.tags.map((tag, i) => (
                                <span key={i} className="rounded bg-white px-1.5 py-0.5 text-neutral-600 border border-neutral-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800/60">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {node.meta && <span className="ml-auto text-neutral-500 dark:text-slate-400">{node.meta}</span>}
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
      {legends && legends.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 text-xs font-mono text-neutral-600 dark:border-slate-800/80 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-neutral-500 dark:text-slate-500">Legend:</span>
            {legends.map((item) => {
              const theme = STATUS_COLORS[item.status] || STATUS_COLORS.neutral;
              const isActive = activeFilterStatus === item.status;

              return (
                <button
                  key={item.status}
                  onClick={() => setActiveFilterStatus(isActive ? null : item.status)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition border ${
                    isActive
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-slate-800 dark:text-white dark:border-cyan-500/50'
                      : 'hover:bg-neutral-100 border-transparent text-neutral-600 dark:hover:bg-slate-900 dark:text-slate-400'
                  }`}
                  title={item.description}
                >
                  <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
                  <span className="font-medium text-[11px]">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-neutral-400 dark:text-slate-500 italic">
            * Hover over nodes to inspect dynamic data flow
          </div>
        </div>
      )}
    </div>
  );
}
