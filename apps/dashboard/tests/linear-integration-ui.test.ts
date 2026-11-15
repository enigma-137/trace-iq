import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  autoCreateDraft,
  integrationsSettingsHref,
  linearSyncNote,
  parseAutoCreateDraft,
  sameAutoCreate,
  linearReturnMessage,
  needsLinearSettings,
  readApiErrorCode,
  readLinearReturn,
  statusLabel,
  stripLinearReturn
} from '../src/lib/linear';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('Linear return flags', () => {
  it('reads a forwarded code and state', () => {
    expect(readLinearReturn(new URLSearchParams('linear=complete&linear_code=c1&linear_state=s.1&projectId=p'))).toEqual({
      kind: 'complete',
      code: 'c1',
      state: 's.1'
    });
  });

  it('reads errors, and treats an incomplete forward as an error', () => {
    expect(readLinearReturn(new URLSearchParams('linear=error&reason=cancelled'))).toEqual({ kind: 'error', reason: 'cancelled' });
    expect(readLinearReturn(new URLSearchParams('linear=error'))).toEqual({ kind: 'error', reason: 'linear_error' });
    expect(readLinearReturn(new URLSearchParams('linear=complete&linear_code=c1'))).toEqual({ kind: 'error', reason: 'missing_code' });
    expect(readLinearReturn(new URLSearchParams('projectId=p'))).toBeNull();
  });

  it('strips the code from the URL but keeps the project', () => {
    expect(stripLinearReturn('https://app.test/dashboard/settings/integrations?linear=complete&linear_code=c&linear_state=s&projectId=p#x')).toBe(
      '/dashboard/settings/integrations?projectId=p#x'
    );
    expect(stripLinearReturn('https://app.test/dashboard/settings/integrations?linear=error&reason=expired')).toBe('/dashboard/settings/integrations');
  });

  it('explains every reason the API can send, with a fallback', () => {
    for (const reason of ['cancelled', 'expired', 'invalid_state', 'missing_code', 'not_configured', 'linear_error']) {
      expect(linearReturnMessage(reason)).toMatch(/\w/);
    }
    expect(linearReturnMessage('something_new')).toBe(linearReturnMessage('linear_error'));
  });
});

describe('Linear error routing', () => {
  it('sends setup problems to settings and keeps other failures on the page', () => {
    expect(needsLinearSettings('LINEAR_NOT_CONNECTED')).toBe(true);
    expect(needsLinearSettings('LINEAR_NEEDS_RECONNECT')).toBe(true);
    expect(needsLinearSettings('LINEAR_TEAM_NOT_SET')).toBe(true);
    expect(needsLinearSettings('LINEAR_ERROR')).toBe(false);
    expect(needsLinearSettings(null)).toBe(false);
  });

  it('reads the error code without consuming the response body', async () => {
    const response = new Response(JSON.stringify({ code: 'LINEAR_TEAM_NOT_SET', message: 'Choose a team' }), { status: 409 });
    expect(await readApiErrorCode(response)).toBe('LINEAR_TEAM_NOT_SET');
    expect(await response.json()).toMatchObject({ message: 'Choose a team' });
    expect(await readApiErrorCode(new Response(JSON.stringify({ message: { code: 'LINEAR_ERROR' } }), { status: 502 }))).toBe('LINEAR_ERROR');
    expect(await readApiErrorCode(new Response('not json', { status: 500 }))).toBeNull();
  });

  it('links to the integrations settings for a project', () => {
    expect(integrationsSettingsHref('proj 1')).toBe('/dashboard/settings/integrations?projectId=proj%201');
    expect(integrationsSettingsHref(null)).toBe('/dashboard/settings/integrations');
  });

  it('labels each connection state', () => {
    expect(statusLabel('active')).toEqual({ tone: 'success', text: 'Connected' });
    expect(statusLabel('needs_reconnect')).toEqual({ tone: 'warning', text: 'Needs reconnect' });
    expect(statusLabel('not_connected')).toEqual({ tone: 'neutral', text: 'Not connected' });
  });
});

describe('Linear settings card', () => {
  const card = read('app/dashboard/settings/integrations/LinearIntegrationCard.tsx');

  it('finishes the connection with the signed-in session, once, after clearing the code from the URL', () => {
    expect(card).toContain('`${LINEAR_API}/complete`');
    expect(card).toContain("method: 'POST'");
    expect(card).toContain('handledReturn.current = true');
    expect(card.indexOf('window.history.replaceState')).toBeLessThan(card.indexOf('`${LINEAR_API}/complete`'));
  });

  it('covers not connected, connected and needs reconnect, and confirms disconnect', () => {
    expect(card).toContain('Connect Linear');
    expect(card).toContain('Reconnect');
    expect(card).toContain('Disconnect Linear?');
    expect(card).toContain("method: 'DELETE'");
    expect(card).toContain("method: 'PUT'");
    expect(card).toContain('/labels');
  });

  it('is reachable from the settings tabs', () => {
    expect(read('app/dashboard/settings/SettingsTabs.tsx')).toContain("href: '/dashboard/settings/integrations', label: 'Integrations'");
  });
});

describe('Create Linear issue button', () => {
  const view = read('app/dashboard/errors/ErrorTrackingClientView.tsx');

  it('posts to the error issue endpoint and shows the identifier as a link afterwards', () => {
    expect(view).toContain('/linear-issue`');
    expect(view).toContain('Create Linear issue');
    expect(view).toContain('{linearIssue.identifier}');
    expect(view).toContain('rel="noopener noreferrer"');
  });

  it('sends setup problems to the settings card and handles loading', () => {
    expect(view).toContain('needsLinearSettings(code)');
    expect(view).toContain('router.push(integrationsSettingsHref(detailProjectId))');
    expect(view).toContain("creatingLinearIssue ? 'Creating…' : 'Create Linear issue'");
  });
});

describe('auto-create settings', () => {
  const saved = {
    projectId: 'p', teamId: 't', teamName: null, teamKey: null, labelId: null, labelName: null,
    autoCreate: true, autoCreateMinOccurrences: 50, autoCreateMinUsers: null
  };

  it('starts off by default and loads a saved rule', () => {
    expect(autoCreateDraft(null)).toEqual({ enabled: false, minOccurrences: '', minUsers: '' });
    expect(autoCreateDraft(saved)).toEqual({ enabled: true, minOccurrences: '50', minUsers: '' });
  });

  it('validates thresholds like the API', () => {
    expect(parseAutoCreateDraft({ enabled: true, minOccurrences: '50', minUsers: '' })).toEqual({ rule: { enabled: true, minOccurrences: 50, minUsers: null } });
    expect(parseAutoCreateDraft({ enabled: true, minOccurrences: '', minUsers: ' 5 ' })).toEqual({ rule: { enabled: true, minOccurrences: null, minUsers: 5 } });
    expect(parseAutoCreateDraft({ enabled: false, minOccurrences: '', minUsers: '' })).toEqual({ rule: { enabled: false, minOccurrences: null, minUsers: null } });
    expect(parseAutoCreateDraft({ enabled: true, minOccurrences: '', minUsers: '' })).toHaveProperty('error');
    expect(parseAutoCreateDraft({ enabled: true, minOccurrences: '0', minUsers: '' })).toHaveProperty('error');
    expect(parseAutoCreateDraft({ enabled: true, minOccurrences: '1.5', minUsers: '' })).toHaveProperty('error');
    expect(parseAutoCreateDraft({ enabled: true, minOccurrences: '', minUsers: '2000000' })).toHaveProperty('error');
  });

  it('knows when the form differs from what is saved', () => {
    expect(sameAutoCreate({ enabled: true, minOccurrences: '50', minUsers: '' }, saved)).toBe(true);
    expect(sameAutoCreate({ enabled: true, minOccurrences: '60', minUsers: '' }, saved)).toBe(false);
    expect(sameAutoCreate({ enabled: false, minOccurrences: '', minUsers: '' }, null)).toBe(true);
  });

  it('is in the Linear card and saved with the defaults', () => {
    const card = read('app/dashboard/settings/integrations/LinearIntegrationCard.tsx');
    expect(card).toContain('Create issues automatically');
    expect(card).toContain('autoCreate: parsed.rule');
    expect(card).toContain('Off by default.');
  });
});

describe('synced from Linear note', () => {
  it('explains resolves and reopens that came from Linear', () => {
    expect(linearSyncNote('linear', 'resolved', 'ENG-1')).toBe('Resolved because Linear issue ENG-1 was closed. Synced from Linear.');
    expect(linearSyncNote('linear', 'open', 'ENG-1')).toBe('Reopened because Linear issue ENG-1 was reopened. Synced from Linear.');
    expect(linearSyncNote('linear', 'resolved', null)).toBe('Resolved because Linear issue was closed. Synced from Linear.');
  });

  it('says nothing for changes made in TraceIQ or for regressions', () => {
    expect(linearSyncNote(null, 'resolved', 'ENG-1')).toBeNull();
    expect(linearSyncNote('linear', 'regressed', 'ENG-1')).toBeNull();
    expect(linearSyncNote('linear', 'ignored', 'ENG-1')).toBeNull();
  });

  it('is shown on the error page until someone changes the status here', () => {
    const view = read('app/dashboard/errors/ErrorTrackingClientView.tsx');
    expect(view).toContain('const syncNote = saved || !detailMatches');
    expect(view).toContain('{syncNote}');
  });
});
