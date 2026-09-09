'use client';

import React, { useState } from 'react';
import { getCountryFlag } from '@/lib/country-codes';

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

export { getCountryFlag };

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
      className={`relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
            Top locations
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            Geographic distribution of visitors across countries and cities.
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

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Countries Column */}
        <div className={`${activeTab === 'cities' ? 'hidden sm:block' : 'block'}`}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Countries
          </p>
          {countries.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-400 dark:text-slate-600">No country location data yet</p>
          ) : (
            <div className="space-y-3.5">
              {countries.slice(0, 6).map((item) => {
                const flag = getCountryFlag(item.name);
                const relativePct = Math.max(8, Math.min(100, (item.total / maxCountry) * 100));
                return (
                  <div key={item.name} className="group flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-neutral-800 dark:text-slate-200">
                        <span className="text-sm leading-none">{flag}</span>
                        <span className="capitalize">{item.name}</span>
                      </span>
                      <span className="font-mono text-neutral-500 dark:text-slate-400">
                        {formatVolume(item.total)} · <span className="font-semibold text-neutral-700 dark:text-slate-300">{item.percentage.toFixed(1)}%</span>
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800/80">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out group-hover:from-purple-400 group-hover:to-pink-400"
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
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Cities
          </p>
          {cities.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-400 dark:text-slate-600">No city location data yet</p>
          ) : (
            <div className="space-y-3.5">
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
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800/80">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out group-hover:from-indigo-400 group-hover:to-purple-400"
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
