import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenCipher } from '../src/modules/integrations/common/token-cipher';
import {
  MAX_STACK_LINES,
  MAX_TITLE_LENGTH,
  buildLinearIssueDescription,
  buildLinearIssueTitle,
  errorIssueLink
} from '../src/modules/integrations/linear/linear-issue.format';
import { LinearIssuesService } from '../src/modules/integrations/linear/linear-issues.service';
import { LinearClient } from '../src/modules/integrations/linear/linear.client';
import { LinearService } from '../src/modules/integrations/linear/linear.service';
import { MockDb, empty, mockDatabase, rows } from './helpers/mock-db';

const user = { id: 'usr_1', email: 'a@b.co', authMethod: 'supabase' as const };
const cipher = new TokenCipher();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const source = {
  issueId: 'fp_1',
  projectId: 'proj_1',
  type: 'TypeError',
  message: "Cannot read properties of undefined (reading 'id')",
  stack: "TypeError: Cannot read properties of undefined\n    at Checkout (src/Checkout.tsx:42:7)\n    at render (react-dom.js:1:1)",
  occurrences: 1234,
  users: 56,
  firstSeen: '2026-11-01T10:20:30.000Z',
  lastSeen: '2026-11-15T08:00:00.000Z',
  environment: 'production',
  release: '2.4.1',
  days: 90,
  dashboardBaseUrl: 'https://app.test/'
};

describe('Linear issue format', () => {
  it('titles the issue with the error type and message', () => {
    expect(buildLinearIssueTitle('TypeError', "Cannot read 'id'")).toBe("TypeError: Cannot read 'id'");
    expect(buildLinearIssueTitle('', '  multi\n line  ')).toBe('Error: multi line');
    const long = buildLinearIssueTitle('Error', 'x'.repeat(500));
    expect(long.length).toBe(MAX_TITLE_LENGTH);
    expect(long.endsWith('…')).toBe(true);
  });

  it('includes the facts, the stack and a link back to TraceIQ', () => {
    const description = buildLinearIssueDescription(source);
    expect(description).toContain('**TypeError**');
    expect(description).toContain('| Occurrences | 1,234 (last 90 days) |');
    expect(description).toContain('| Affected users | 56 |');
    expect(description).toContain('| First seen | 2026-11-01 10:20 UTC |');
    expect(description).toContain('| Last seen | 2026-11-15 08:00 UTC |');
    expect(description).toContain('| Environment | `production` |');
    expect(description).toContain('| Release | `2.4.1` |');
    expect(description).toContain('at Checkout (src/Checkout.tsx:42:7)');
    expect(description).toContain('[Open in TraceIQ](https://app.test/dashboard/errors?issue=fp_1&projectId=proj_1)');
  });

  it('leaves out environment and release when they are unknown', () => {
    const description = buildLinearIssueDescription({ ...source, environment: null, release: null, stack: null });
    expect(description).not.toContain('Environment');
    expect(description).not.toContain('Release');
    expect(description).not.toContain('Stack trace');
  });

  it('truncates long stacks', () => {
    const stack = Array.from({ length: 80 }, (_, i) => `    at frame${i} (app.js:${i}:1)`).join('\n');
    const description = buildLinearIssueDescription({ ...source, stack });
    expect(description).toContain('**Stack trace** (truncated)');
    expect(description).toContain(`frame${MAX_STACK_LINES - 1} `);
    expect(description).not.toContain(`frame${MAX_STACK_LINES} `);
  });

  it('keeps untrusted error text inside code fences', () => {
    const description = buildLinearIssueDescription({
      ...source,
      type: '[click](https://evil.test)',
      message: '```\n[Phish](https://evil.test) @everyone\n```',
      stack: 'at x ```` [y](https://evil.test)'
    });
    // No fence can be closed early by the message or stack.
    expect(description.match(/```/g)).toHaveLength(4);
    expect(description).not.toMatch(/\]\(https:\/\/evil\.test\)(?![^`]*```)/);
    expect(description).toContain('\\[click\\]\\(https://evil.test\\)');
  });

  it('builds the dashboard link with encoded ids', () => {
    expect(errorIssueLink('https://app.test', 'proj 1', 'a&b')).toBe('https://app.test/dashboard/errors?issue=a%26b&projectId=proj+1');
  });
});

describe('LinearIssuesService', () => {
  const fetchMock = vi.fn();
  let db: MockDb;
  let connection: Record<string, unknown> | null;
  let settings: Record<string, unknown> | null;
  let link: Record<string, unknown> | null;
  let linkAfterLock: Record<string, unknown> | null;
  let service: LinearIssuesService;
  const projects = { requireWritableProject: vi.fn(), requireActiveProject: vi.fn() };
  const errors = { issueDetail: vi.fn() };
  let claimHeld: boolean;

  const detail = {
    issue: { id: 'fp_1', type: 'TypeError', message: 'boom' },
    totals: { occurrences: 12, sessions: 4, users: 3, firstSeen: '2026-11-01T00:00:00Z', lastSeen: '2026-11-14T00:00:00Z', firstRelease: '1.0.0', lastRelease: '1.2.0' },
    samples: [{ stack: 'minified stack', symbolicated: { stack: 'at Checkout (src/Checkout.tsx:42:7)', mappedFrames: 1, context: null } }]
  };

  beforeEach(() => {
    process.env.DASHBOARD_URL = 'https://app.test';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    connection = {
      id: 'lin_1',
      organizationId: 'org_1',
      accessTokenEncrypted: cipher.encrypt('access-1'),
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      status: 'active',
      workspaceId: 'ws_1'
    };
    settings = { teamId: 'team_1', labelId: 'lbl_1' };
    link = null;
    linkAfterLock = null;
    let locked = false;
    claimHeld = false;
    db = mockDatabase((text, values) => {
      if (text.includes('INSERT INTO error_linear_issue_claims')) {
        locked = true;
        return claimHeld ? empty() : rows([{ claimed_at: '2026-11-15T00:00:00Z' }]);
      }
      if (text.includes('FROM error_linear_issues')) {
        const found = locked ? linkAfterLock ?? link : link;
        return found ? rows([found]) : empty();
      }
      if (text.includes('FROM linear_connections WHERE organization_id')) return connection ? rows([connection]) : empty();
      if (text.includes('FROM linear_project_settings')) return settings ? rows([settings]) : empty();
      if (text.includes("e.context->>'environment'")) return rows([{ environment: 'production' }]);
      if (text.includes('INSERT INTO error_linear_issues')) {
        return rows([{ linearIssueId: values[3], identifier: values[4], url: values[5], createdAt: '2026-11-15T00:00:00Z' }]);
      }
      return empty();
    });
    projects.requireWritableProject.mockReset().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1', role: 'member' });
    errors.issueDetail.mockReset().mockResolvedValue(detail);
    const client = new LinearClient(db as never, cipher);
    const linearService = new LinearService(db as never, projects as never, client, cipher);
    service = new LinearIssuesService(db as never, projects as never, errors as never, linearService, client);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DASHBOARD_URL;
  });

  it('creates an issue in the default team with the label and stores the link', async () => {
    fetchMock.mockResolvedValue(json({ data: { issueCreate: { success: true, issue: { id: 'iss_1', identifier: 'ENG-123', url: 'https://linear.app/acme/issue/ENG-123' } } } }));
    const result = await service.createForError(user, 'fp_1', 'proj_1');

    expect(result).toEqual({
      created: true,
      linearIssue: { linearIssueId: 'iss_1', identifier: 'ENG-123', url: 'https://linear.app/acme/issue/ENG-123', createdAt: '2026-11-15T00:00:00Z' }
    });
    const { variables } = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(variables.input.teamId).toBe('team_1');
    expect(variables.input.labelIds).toEqual(['lbl_1']);
    expect(variables.input.title).toBe('TypeError: boom');
    // The source-mapped stack is preferred over the minified one.
    expect(variables.input.description).toContain('at Checkout (src/Checkout.tsx:42:7)');
    expect(variables.input.description).not.toContain('minified stack');
    expect(variables.input.description).toContain('| Environment | `production` |');
    expect(variables.input.description).toContain('| Release | `1.2.0` |');
    expect(errors.issueDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_1' }), { id: 'fp_1', days: '90' });

    const insert = db.queryCalls('INSERT INTO error_linear_issues')[0];
    expect(insert.values).toEqual(['proj_1', 'fp_1', 'ws_1', 'iss_1', 'ENG-123', 'https://linear.app/acme/issue/ENG-123', 'team_1', 'usr_1', 'manual']);
    // The claim is taken before Linear is called and released afterwards.
    expect(db.queryCalls('INSERT INTO error_linear_issue_claims')[0].values).toEqual(['proj_1', 'fp_1', 300]);
    expect(db.queryCalls('DELETE FROM error_linear_issue_claims')[0].values).toEqual(['proj_1', 'fp_1']);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('omits labels when the project has none', async () => {
    settings = { teamId: 'team_1', labelId: null };
    fetchMock.mockResolvedValue(json({ data: { issueCreate: { success: true, issue: { id: 'iss_1', identifier: 'ENG-1', url: 'https://linear.app/x' } } } }));
    await service.createForError(user, 'fp_1', 'proj_1');
    const { variables } = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(variables.input.labelIds).toBeUndefined();
  });

  it('returns the existing link instead of creating a duplicate', async () => {
    link = { linearIssueId: 'iss_1', identifier: 'ENG-123', url: 'https://linear.app/x', createdAt: '2026-11-01T00:00:00Z' };
    const result = await service.createForError(user, 'fp_1', 'proj_1');
    expect(result).toEqual({ created: false, linearIssue: link });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.queryCalls('INSERT INTO error_linear_issues')).toHaveLength(0);
  });

  it('returns the link another request finished just before this one took the claim', async () => {
    linkAfterLock = { linearIssueId: 'iss_9', identifier: 'ENG-9', url: 'https://linear.app/y', createdAt: '2026-11-15T00:00:00Z' };
    const result = await service.createForError(user, 'fp_1', 'proj_1');
    expect(result).toEqual({ created: false, linearIssue: linkAfterLock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.queryCalls('DELETE FROM error_linear_issue_claims')).toHaveLength(1);
  });

  it('reports in-progress when another request holds the claim', async () => {
    claimHeld = true;
    await expect(service.createForError(user, 'fp_1', 'proj_1')).rejects.toMatchObject({ response: { code: 'LINEAR_ISSUE_IN_PROGRESS' } });
    expect(fetchMock).not.toHaveBeenCalled();
    // Not ours, so not released.
    expect(db.queryCalls('DELETE FROM error_linear_issue_claims')).toHaveLength(0);
  });

  it('returns the other request’s link when the claim is held and it has landed', async () => {
    claimHeld = true;
    linkAfterLock = { linearIssueId: 'iss_9', identifier: 'ENG-9', url: 'https://linear.app/y', createdAt: '2026-11-15T00:00:00Z' };
    await expect(service.createForError(user, 'fp_1', 'proj_1')).resolves.toEqual({ created: false, linearIssue: linkAfterLock });
  });

  it('releases the claim when Linear fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(service.createForError(user, 'fp_1', 'proj_1')).rejects.toMatchObject({ response: { code: 'LINEAR_ERROR' } });
    expect(db.queryCalls('DELETE FROM error_linear_issue_claims')).toHaveLength(1);
  });

  it('reports when Linear is not connected, needs reconnecting, or has no default team', async () => {
    connection = null;
    await expect(service.createForError(user, 'fp_1', 'proj_1')).rejects.toMatchObject({ response: { code: 'LINEAR_NOT_CONNECTED' } });
    await expect(service.createForError(user, 'fp_1', 'proj_1')).rejects.toBeInstanceOf(NotFoundException);

    connection = { id: 'lin_1', organizationId: 'org_1', status: 'needs_reconnect', workspaceId: 'ws_1' };
    await expect(service.createForError(user, 'fp_1', 'proj_1')).rejects.toMatchObject({ response: { code: 'LINEAR_NEEDS_RECONNECT' } });

    connection = { id: 'lin_1', organizationId: 'org_1', accessTokenEncrypted: cipher.encrypt('a'), status: 'active', workspaceId: 'ws_1' };
    settings = null;
    await expect(service.createForError(user, 'fp_1', 'proj_1')).rejects.toMatchObject({ response: { code: 'LINEAR_TEAM_NOT_SET' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks the connection for reconnecting and stores nothing when Linear returns 401', async () => {
    fetchMock.mockResolvedValue(json({ errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] }, 401));
    const attempt = service.createForError(user, 'fp_1', 'proj_1');
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({ response: { code: 'LINEAR_NEEDS_RECONNECT' } });
    expect(db.queryCalls("SET status = 'needs_reconnect'")[0].values).toEqual(['lin_1']);
    expect(db.queryCalls('INSERT INTO error_linear_issues')).toHaveLength(0);
  });

  it('maps other Linear failures to a 502 with a readable message', async () => {
    fetchMock.mockResolvedValue(json({ errors: [{ message: 'x', extensions: { code: 'INVALID_INPUT', userPresentableMessage: 'Label not found' } }] }, 400));
    await expect(service.createForError(user, 'fp_1', 'proj_1')).rejects.toMatchObject({ status: 502, response: { code: 'LINEAR_ERROR', message: 'Label not found' } });
  });

  it('refuses unknown error issues and bad ids', async () => {
    errors.issueDetail.mockResolvedValue({ ...detail, totals: { ...detail.totals, occurrences: 0 }, samples: [] });
    await expect(service.createForError(user, 'fp_missing', 'proj_1')).rejects.toThrow('Error issue not found.');
    await expect(service.createForError(user, '  ', 'proj_1')).rejects.toThrow('id is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks project write access first', async () => {
    projects.requireWritableProject.mockRejectedValue(new NotFoundException('Project not found or not accessible.'));
    await expect(service.createForError(user, 'fp_1', 'proj_other')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('LinearIssuesController', () => {
  it('requires the errors:write scope', async () => {
    const { LinearIssuesController } = await import('../src/modules/integrations/linear/linear-issues.controller');
    const { ForbiddenException } = await import('@nestjs/common');
    const authService = {
      getDashboardUser: vi.fn(async () => ({ id: 'usr_1', authMethod: 'pat', scopes: ['errors:read'] })),
      requireScope: vi.fn((_user: unknown, scope: string) => {
        throw new ForbiddenException(`Personal access token requires "${scope}" scope.`);
      })
    };
    const issues = { createForError: vi.fn() };
    const controller = new LinearIssuesController(authService as never, issues as never);
    await expect(controller.create('fp_1', { projectId: 'proj_1' }, 'Bearer tiq_pat_x')).rejects.toThrow('errors:write');
    expect(issues.createForError).not.toHaveBeenCalled();
  });
});
