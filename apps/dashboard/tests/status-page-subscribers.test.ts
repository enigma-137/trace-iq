import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', 'src', path), 'utf8');

describe('status page subscribers', () => {
  it('lets visitors subscribe from the public page', () => {
    const view = read('app/status/[slug]/ProjectStatusView.tsx');
    expect(view).toContain('<SubscribeForm slug={data.page.slug} title={data.page.title} />');
    const form = read('app/status/[slug]/SubscribeForm.tsx');
    expect(form).toContain('/v1/status/pages/${encodeURIComponent(slug)}/subscribe');
    expect(form).toContain('type="email"');
    expect(form).toContain('Check <strong>{state.email}</strong> for a link to confirm');
  });

  it('confirms and unsubscribes only after a click, never on page load', () => {
    const action = read('app/status/[slug]/subscription/SubscriptionAction.tsx');
    expect(action).toContain('/v1/status/subscribers/${action}');
    expect(action).toContain("params.get('action') === 'unsubscribe' ? 'unsubscribe' : 'confirm'");
    expect(action).toContain('onClick={() => void run()}');
    expect(action).not.toContain('useEffect');
    expect(read('app/status/[slug]/subscription/page.tsx')).toContain('robots: { index: false, follow: false }');
  });

  it('offers to email subscribers when posting, and only when someone would get it', () => {
    const manager = read('app/dashboard/status-page/StatusPageManager.tsx');
    expect(manager).toContain('if (!data.page?.enabled || !data.subscribers?.emailAvailable) return 0;');
    expect(manager).toContain('if (count === 0) return null;');
    expect(manager.match(/<NotifyCheckbox count=\{audience\}/g)).toHaveLength(2);
    expect(manager.match(/notify: audience > 0 && notify/g)).toHaveLength(2);
  });
});
