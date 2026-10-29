'use client';

import React, { useState } from 'react';
import { CountryFlag } from '@/components/icons/CountryFlag';

export interface LocationItem {
  name: string;
  total: number;
  percentage: number;
}

interface TopLocationsCardProps {
  countries: LocationItem[];
  cities: LocationItem[];
  className?: string;
}

function formatVolume(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString();
}

export function TopLocationsCard({ countries = [], cities = [], className = '' }: TopLocationsCardProps) {
  const [activeTab, setActiveTab] = useState<'both' | 'countries' | 'cities'>('both');

  const maxCountry = countries[0]?.total || 1;
  const maxCity = cities[0]?.total || 1;

  return (
    <div
      className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-none ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Locations
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            Visitors by country and city
          </p>
        </div>

        {/* Tab switcher for smaller viewports */}
        <div className="flex sm:hidden items-center gap-1 rounded bg-neutral-100 p-0.5 dark:bg-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('countries')}
            className={`rounded px-2 py-1 font-medium transition ${
              activeTab === 'countries' ? 'bg-white shadow-xs dark:bg-slate-700 text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-slate-400'
            }`}
          >
            Countries
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cities')}
            className={`rounded px-2 py-1 font-medium transition ${
              activeTab === 'cities' ? 'bg-white shadow-xs dark:bg-slate-700 text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-slate-400'
            }`}
          >
            Cities
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2">
        {/* Countries Column */}
        <div className={`${activeTab === 'cities' ? 'hidden sm:block' : 'block'}`}>
          <p className="mb-3 text-xs font-medium text-neutral-500 dark:text-slate-400">
            Countries
          </p>
          {countries.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-400 dark:text-slate-600">No country location data yet</p>
          ) : (
            <div className="space-y-3">
              {countries.slice(0, 6).map((item) => {
                const relativePct = Math.max(8, Math.min(100, (item.total / maxCountry) * 100));
                return (
                  <div key={item.name} className="group flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-neutral-800 dark:text-slate-200">
                        <CountryFlag country={item.name} />
                        <span className="capitalize">{item.name}</span>
                      </span>
                      <span className="font-mono text-neutral-500 dark:text-slate-400">
                        {formatVolume(item.total)} · <span className="font-semibold text-neutral-700 dark:text-slate-300">{item.percentage.toFixed(1)}%</span>
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-500 ease-out"
                        style={{ width: `${relativePct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cities Column */}
        <div className={`${activeTab === 'countries' ? 'hidden sm:block' : 'block'}`}>
          <p className="mb-3 text-xs font-medium text-neutral-500 dark:text-slate-400">
            Cities
          </p>
          {cities.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-400 dark:text-slate-600">No city location data yet</p>
          ) : (
            <div className="space-y-3">
              {cities.slice(0, 6).map((item) => {
                const relativePct = Math.max(8, Math.min(100, (item.total / maxCity) * 100));
                return (
                  <div key={item.name} className="group flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-neutral-800 dark:text-slate-200 capitalize">
                        {item.name}
                      </span>
                      <span className="font-mono text-neutral-500 dark:text-slate-400">
                        {formatVolume(item.total)} · <span className="font-semibold text-neutral-700 dark:text-slate-300">{item.percentage.toFixed(1)}%</span>
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-500/70 dark:bg-blue-400/70 transition-all duration-500 ease-out"
                        style={{ width: `${relativePct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TopLocationsCard;
