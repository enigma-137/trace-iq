'use client';

import { useState, useEffect, FormEvent } from 'react';
import { DashboardDialog } from '../DashboardDialog';

interface NotificationGroup {
  id: string;
  name: string;
  memberEmails: string[];
}

interface NotificationGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, memberEmails: string[], id?: string) => Promise<void>;
  groupToEdit?: NotificationGroup | null;
  isSubmitting: boolean;
  error?: string | null;
}

export function NotificationGroupModal({
  open,
  onClose,
  onSave,
  groupToEdit,
  isSubmitting,
  error
}: NotificationGroupModalProps) {
  const [name, setName] = useState('');
  const [emailsInput, setEmailsInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(groupToEdit?.name ?? '');
      setEmailsInput(groupToEdit?.memberEmails ? groupToEdit.memberEmails.join(', ') : '');
      setValidationError(null);
    }
  }, [open, groupToEdit]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError('Please specify a name for the notification group.');
      return;
    }

    const memberEmails = emailsInput
      .split(/[,\s]+/u)
      .map((e) => e.trim())
      .filter(Boolean);

    if (memberEmails.length === 0) {
      setValidationError('Please add at least one member email address.');
      return;
    }

    await onSave(name.trim(), memberEmails, groupToEdit?.id);
  }

  return (
    <DashboardDialog
      open={open}
      onClose={onClose}
      title={groupToEdit ? 'Edit Notification Group' : 'Create Notification Group'}
      description="Notification groups allow you to bundle multiple team or on-call emails and attach them to any alert with one click."
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
            {isSubmitting ? 'Saving group…' : groupToEdit ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1.5">
            Group Name <span className="text-blue-600">*</span>
          </label>
          <input
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setValidationError(null);
            }}
            placeholder="e.g. SRE Team, Frontend On-Call, Executive Alerts"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1.5">
            Member Email Addresses (comma-separated) <span className="text-blue-600">*</span>
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
            value={emailsInput}
            onChange={(e) => {
              setEmailsInput(e.target.value);
              setValidationError(null);
            }}
            placeholder="dev@acme.com, oncall@acme.com, security@acme.com"
          />
          <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">
            Whenever an alert attached to this group triggers, an incident notification is emailed to all listed members.
          </p>
        </div>

        {validationError || error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {validationError || error}
          </div>
        ) : null}
      </form>
    </DashboardDialog>
  );
}
