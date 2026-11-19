'use client';

import { useEffect, useState } from 'react';
import Mail01Icon from '@hugeicons/core-free-icons/Mail01Icon';
import { clientFetch } from '@/lib/analytics-api';
import { toast } from '@/lib/toast';
import { Notice, SettingsCard, Switch } from './SettingsUI';

interface EmailPreferences {
  email: string | null;
  productUpdates: boolean;
}

/** Settings → Email: the monthly product-update email, on by default. */
export function EmailPreferencesPanel() {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void clientFetch<EmailPreferences>('/v1/dashboard/me/email-preferences').then(({ data, error: loadError }) => {
      if (data) setPrefs(data);
      else setError(loadError);
    });
  }, []);

  async function change(productUpdates: boolean) {
    setSaving(true);
    const { data, error: saveError } = await clientFetch<EmailPreferences>('/v1/dashboard/me/email-preferences', {
      method: 'PUT',
      body: JSON.stringify({ productUpdates })
    });
    setSaving(false);
    if (data) {
      setPrefs(data);
      toast.success(productUpdates ? 'You’ll get the monthly product update.' : 'You won’t get product updates any more.');
    } else {
      toast.error(saveError ?? 'Couldn’t save your email preference.');
    }
  }

  return (
    <SettingsCard
      icon={Mail01Icon}
      title="Product updates"
      description={
        <>
          A short email about once a month with what&rsquo;s new in TraceIQ, from the{' '}
          <a href="/changelog" className="underline underline-offset-2">changelog</a>.
          {prefs?.email ? <> Sent to {prefs.email}.</> : null}
        </>
      }
      actions={
        prefs ? (
          <Switch
            checked={prefs.productUpdates}
            onChange={(value) => void change(value)}
            disabled={saving || !prefs.email}
            label="Email me product updates"
          />
        ) : null
      }
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
    </SettingsCard>
  );
}
