'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Select, Combobox, Checkbox } from '@traceiq/ui';
import { SegmentFilters, FilterCondition, cleanFilters } from '@/components/SegmentFilters';
import { DashboardDialog } from '../DashboardDialog';

export interface AlertFormData {
  name: string;
  eventName: string;
  measure: string;
  property?: string;
  windowHours: number;
  condition: string;
  threshold: number;
  filters: FilterCondition[];
  webhookUrl?: string;
  emailRecipients: string[];
  notificationGroupIds: string[];
}

interface NotificationGroup {
  id: string;
  name: string;
  memberEmails: string[];
}

interface CreateAlertModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: AlertFormData) => Promise<void>;
  eventNames: string[];
  notificationGroups: NotificationGroup[];
  initialData?: Partial<AlertFormData>;
  isSubmitting: boolean;
  error?: string | null;
}

const MEASURES = [
  { value: 'count', label: 'Event count' },
  { value: 'unique', label: 'Unique users' },
  { value: 'sum', label: 'Sum of property' },
  { value: 'avg', label: 'Average of property' }
];

const WINDOWS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 24, label: '24 hours' },
  { value: 168, label: '7 days' }
];

const CONDITIONS = [
  { value: 'drops_by', label: 'drops by (%)', percent: true, desc: 'Triggers when current period drops vs previous' },
  { value: 'spikes_by', label: 'spikes by (%)', percent: true, desc: 'Triggers when current period spikes vs previous' },
  { value: 'above', label: 'is above (threshold)', percent: false, desc: 'Triggers when value exceeds threshold' },
  { value: 'below', label: 'is below (threshold)', percent: false, desc: 'Triggers when value falls below threshold' }
];

export function CreateAlertModal({
  open,
  onClose,
  onSave,
  eventNames,
  notificationGroups,
  initialData,
  isSubmitting,
  error
}: CreateAlertModalProps) {
  const [name, setName] = useState('');
  const [eventName, setEventName] = useState(eventNames[0] ?? '');
  const [measure, setMeasure] = useState('count');
  const [property, setProperty] = useState('');
  const [windowHours, setWindowHours] = useState(24);
  const [condition, setCondition] = useState('drops_by');
  const [threshold, setThreshold] = useState('30');
  const [showSegmentFilters, setShowSegmentFilters] = useState(false);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [recipientsInput, setRecipientsInput] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setEventName(initialData?.eventName ?? eventNames[0] ?? '');
      setMeasure(initialData?.measure ?? 'count');
      setProperty(initialData?.property ?? '');
      setWindowHours(initialData?.windowHours ?? 24);
      setCondition(initialData?.condition ?? 'drops_by');
      setThreshold(String(initialData?.threshold ?? 30));
      setFilters(initialData?.filters ? JSON.parse(JSON.stringify(initialData.filters)) : []);
      setShowSegmentFilters(Boolean(initialData?.filters && initialData.filters.length > 0));
      setWebhookUrl(initialData?.webhookUrl ?? '');
      setRecipientsInput(initialData?.emailRecipients ? initialData.emailRecipients.join(', ') : '');
      setSelectedGroupIds(initialData?.notificationGroupIds ?? []);
      setValidationError(null);
    }
  }, [open, initialData, eventNames]);

  const needsProperty = measure === 'sum' || measure === 'avg';
  const isPercent = CONDITIONS.find((c) => c.value === condition)?.percent ?? false;

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);

    if (!name.trim()) return setValidationError('Please give the alert a descriptive name.');
    if (!eventName.trim()) return setValidationError('Please select an event to monitor.');
    if (needsProperty && !property.trim()) return setValidationError('Please specify a numeric property name to calculate.');
    if (!Number.isFinite(Number(threshold))) return setValidationError('Threshold must be a valid number.');

    const emailRecipients = recipientsInput
      .split(/[,\s]+/u)
      .map((e) => e.trim())
      .filter(Boolean);

    const webhook = webhookUrl.trim();
    if (!webhook && emailRecipients.length === 0 && selectedGroupIds.length === 0) {
      return setValidationError('Please specify at least one notification destination (email, webhook, or group).');
    }

    await onSave({
      name: name.trim(),
      eventName: eventName.trim(),
      measure,
      property: needsProperty ? property.trim() : undefined,
      windowHours,
      condition,
      threshold: Number(threshold),
      filters: cleanFilters(filters),
      webhookUrl: webhook || undefined,
      emailRecipients,
      notificationGroupIds: selectedGroupIds
    });
  }

  // Live readable summary
  const selectedCondObj = CONDITIONS.find((c) => c.value === condition);
  const measureLabel =
    measure === 'count'
      ? `total count of "${eventName || 'event'}"`
      : measure === 'unique'
        ? `unique users triggering "${eventName || 'event'}"`
        : `${measure} of "${property || 'property'}" for "${eventName || 'event'}"`;
  const windowLabelText = WINDOWS.find((w) => w.value === windowHours)?.label ?? `${windowHours}h`;
  const ruleSummaryText = `Triggers when ${measureLabel} ${selectedCondObj?.label ?? condition} ${threshold || '0'}${isPercent ? '%' : ''} over a rolling ${windowLabelText} window.`;

  return (
    <DashboardDialog
      open={open}
      onClose={onClose}
      title={initialData?.name ? 'Edit Alert' : 'Create Automated Alert'}
      description="Set up automatic metric tracking on a rolling window with instant notifications on anomalies or threshold breaches."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500 transition"
          >
            {isSubmitting ? 'Saving alert…' : initialData?.name ? 'Save Changes' : 'Create Alert'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: What to monitor */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-neutral-200/80 pb-2 dark:border-slate-800/80">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              1
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
              What to monitor
            </h4>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                Alert Name <span className="text-blue-600">*</span>
              </label>
              <input
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-blue-500"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setValidationError(null);
                }}
                placeholder="e.g. Signups Dropping, Checkout Error Spike"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                Event Name <span className="text-blue-600">*</span>
              </label>
              <Combobox
                items={eventNames.map((n) => ({ value: n, label: n }))}
                value={eventName}
                onChange={setEventName}
                placeholder="Select or type event…"
                aria-label="Event"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                Calculation Measure
              </label>
              <Select
                value={measure}
                onValueChange={setMeasure}
                items={MEASURES.map((m) => ({ value: m.value, label: m.label }))}
                className="w-full"
              />
            </div>

            {needsProperty ? (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                  Numeric Property Name <span className="text-blue-600">*</span>
                </label>
                <input
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                  placeholder="e.g. amount, duration_ms, items_count"
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Section 2: When to trigger */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-neutral-200/80 pb-2 dark:border-slate-800/80">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              2
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
              When to trigger
            </h4>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                Evaluation Window
              </label>
              <Select
                value={String(windowHours)}
                onValueChange={(val) => setWindowHours(Number(val))}
                items={WINDOWS.map((w) => ({ value: String(w.value), label: w.label }))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                Trigger Condition
              </label>
              <Select
                value={condition}
                onValueChange={setCondition}
                items={CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                {isPercent ? 'Change Percentage (%)' : 'Threshold Value'} <span className="text-blue-600">*</span>
              </label>
              <input
                type="number"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={isPercent ? '30' : '100'}
              />
            </div>
          </div>

          {/* Optional Segmentation Section */}
          <div className="pt-1">
            {!showSegmentFilters ? (
              <button
                type="button"
                onClick={() => setShowSegmentFilters(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add segment / filter criteria (optional)</span>
              </button>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                    Segment Filters
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters([]);
                      setShowSegmentFilters(false);
                    }}
                    className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-200"
                  >
                    Remove filters
                  </button>
                </div>
                <SegmentFilters value={filters} onChange={setFilters} />
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Who should receive it */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-neutral-200/80 pb-2 dark:border-slate-800/80">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              3
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
              Who should receive it
            </h4>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                Webhook URL (Slack, Discord, PagerDuty)
              </label>
              <input
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1">
                Email Recipients (comma-separated)
              </label>
              <input
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
                value={recipientsInput}
                onChange={(e) => setRecipientsInput(e.target.value)}
                placeholder="oncall@acme.com, alerts@acme.com"
                type="email"
                multiple
              />
            </div>
          </div>

          {notificationGroups.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                Notification Groups
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {notificationGroups.map((group) => (
                  <label
                    key={group.id}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 select-none hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                  >
                    <Checkbox
                      checked={selectedGroupIds.includes(group.id)}
                      onCheckedChange={() => toggleGroup(group.id)}
                      aria-label={group.name}
                    />
                    <span>{group.name}</span>
                    <span className="text-neutral-400 dark:text-slate-500">
                      ({group.memberEmails.length})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Real-time Rule Preview */}
        <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 p-3.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
          <span className="font-bold">Rule Summary: </span>
          <span>{ruleSummaryText}</span>
        </div>

        {/* Error Output */}
        {validationError || error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {validationError || error}
          </div>
        ) : null}
      </form>
    </DashboardDialog>
  );
}
