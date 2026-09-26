'use client';

import { useState } from 'react';
import { AddToDashboardModal } from './AddToDashboardModal';
import type { InsightType, VisualizationType } from '@/types/analytics';

export interface AddCurrentViewToDashboardButtonProps {
  title: string;
  description?: string;
  type: InsightType;
  chartType?: VisualizationType;
  query: Record<string, any>;
  visualization?: Record<string, any>;
  dateConfig?: Record<string, any>;
  projectId?: string;
  buttonText?: string;
  className?: string;
  variant?: 'outline' | 'primary' | 'subtle';
}

export function AddCurrentViewToDashboardButton({
  title,
  description,
  type,
  chartType = 'line',
  query,
  visualization = {},
  dateConfig = {},
  projectId,
  buttonText = 'Add to dashboard',
  className = '',
  variant = 'outline'
}: AddCurrentViewToDashboardButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const baseStyle =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm'
      : variant === 'subtle'
      ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-750'
      : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-850';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${baseStyle} ${className}`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>{buttonText}</span>
      </button>

      {isOpen && (
        <AddToDashboardModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          projectId={projectId}
          newInsightPayload={{
            name: title,
            description,
            type,
            chartType,
            query,
            visualization: { chartType, ...visualization },
            dateConfig
          }}
        />
      )}
    </>
  );
}
