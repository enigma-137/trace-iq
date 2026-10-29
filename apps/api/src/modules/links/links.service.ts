import { BadRequestException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extractClientIp, resolveGeo } from '../../common/geo';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { UsageService } from '../billing/usage.service';
import { ProjectsService } from '../projects/projects.service';
import {
  UTM_FIELDS,
  UtmValues,
  cleanUtm,
  generateSlug,
  isBot,
  normalizeSlug,
  parseUserAgent,
  referrerHost,
  validateDestination,
  withUtm
} from './links.util';

export const LINK_CLICK_EVENT = '$link_click';

const RESOLVE_CACHE_MS = 30_000;
const CLICK_DEDUPE_MS = 10_000;
const MAX_DEDUPE_ENTRIES = 50_000;

interface LinkRow {
  [column: string]: unknown;
  id: string;
  organization_id: string;
  project_id: string;
  slug: string;
  destination_url: string;
  title: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  expires_at: string | Date | null;
  archived_at: string | Date | null;
  click_count: number;
  last_clicked_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface LinkInput {
  projectId?: string;
  slug?: string;
  destinationUrl?: string;
  title?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  expiresAt?: string | null;
}

export interface ClickMeta {
  userAgent?: string;
  referrer?: string;
  /**
   * The visitor's IP as seen by the dashboard's /l route. Only shapes click dedupe, the
   * daily anonymous id and the geo fallback; a caller that fakes it gains nothing a real
   * click wouldn't give them.
   */
  clientIp?: string;
  ip?: string;
  forwardedFor?: string;
  realIp?: string;
  headers?: Record<string, string | undefined>;
}

const UTM_INPUT_KEYS: Record<(typeof UTM_FIELDS)[number], keyof LinkInput> = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent'
};

export function shortLinkBaseUrl(): string {
  return (process.env.SHORT_LINK_BASE_URL ?? process.env.DASHBOARD_URL ?? 'https://traceiq.run').replace(/\/+$/, '');
}

@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);
  private readonly resolveCache = new Map<string, { row: LinkRow | null; at: number }>();
  private readonly recentClicks = new Map<string, number>();

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly usage: UsageService
  ) {}

  // -- Dashboard ------------------------------------------------------------

  async list(user: DashboardUser, projectId?: string, includeArchived = false) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return { project: null, baseUrl: shortLinkBaseUrl(), links: [], metrics: { links: 0, clicks7d: 0, clicksTotal: 0 } };

    const [links, clicks] = await Promise.all([
      this.database.query<LinkRow>(
        `SELECT * FROM short_links WHERE project_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY created_at DESC LIMIT 500`,
        [project.id]
      ),
      this.database.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM events
          WHERE project_id = $1 AND event_name = $2 AND occurred_at >= now() - interval '7 days'`,
        [project.id, LINK_CLICK_EVENT]
      )
    ]);

    const serialized = links.rows.map((row) => this.serialize(row));
    return {
      project: { id: project.id, name: project.name },
      baseUrl: shortLinkBaseUrl(),
      links: serialized,
      metrics: {
        links: serialized.filter((link) => !link.archivedAt).length,
        clicks7d: clicks.rows[0]?.total ?? 0,
        clicksTotal: serialized.reduce((sum, link) => sum + link.clickCount, 0)
      }
    };
  }

  async get(user: DashboardUser, id: string, projectId?: string, days = 30) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const link = await this.findInProject(id, project.id);
    const window = Math.min(Math.max(Math.trunc(days) || 30, 1), 90);
    const params = [project.id, LINK_CLICK_EVENT, link.id, window];
    const scope = `project_id = $1 AND event_name = $2 AND properties->>'linkId' = $3
      AND occurred_at >= now() - make_interval(days => $4::int)`;

    const [series, referrers, countries, devices] = await Promise.all([
      this.database.query<{ day: string; clicks: number }>(
        `SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day, count(*)::int AS clicks
           FROM events WHERE ${scope} GROUP BY 1 ORDER BY 1`,
        params
      ),
      this.breakdown(`COALESCE(NULLIF(properties->>'referrerHost', ''), 'Direct')`, scope, params),
      this.breakdown(`COALESCE(NULLIF(network_info->>'country', ''), 'Unknown')`, scope, params),
      this.breakdown(`COALESCE(NULLIF(device_info->>'deviceType', ''), 'unknown')`, scope, params)
    ]);

    return {
      link: this.serialize(link),
      days: window,
      series: fillDays(series.rows, window),
      referrers,
      countries,
      devices
    };
  }

  async create(user: DashboardUser, body: LinkInput) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const destination = this.requireDestination(body.destinationUrl);
    const expiresAt = parseExpiry(body.expiresAt);
    const utm = this.readUtm(body);

    const requested = typeof body.slug === 'string' && body.slug.trim() ? normalizeSlug(body.slug) : null;
    if (requested && 'error' in requested) throw new BadRequestException(requested.error);

    const id = `lnk_${randomUUID()}`;
    // A generated slug retries on the rare collision; a chosen one fails with a clear message.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = requested ? requested.slug : generateSlug();
      const inserted = await this.database.query<LinkRow>(
        `INSERT INTO short_links (
           id, organization_id, project_id, slug, destination_url, title,
           utm_source, utm_medium, utm_campaign, utm_term, utm_content, expires_at, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (slug) DO NOTHING
         RETURNING *`,
        [
          id,
          project.organizationId,
          project.id,
          slug,
          destination,
          cleanTitle(body.title),
          utm.utm_source ?? null,
          utm.utm_medium ?? null,
          utm.utm_campaign ?? null,
          utm.utm_term ?? null,
          utm.utm_content ?? null,
          expiresAt,
          user.id
        ]
      );
      if (inserted.rows[0]) {
        this.resolveCache.delete(slug);
        return this.serialize(inserted.rows[0]);
      }
      if (requested) throw new BadRequestException(`The slug "${slug}" is already taken.`);
    }
    throw new BadRequestException('Could not generate a free slug. Try again or choose one.');
  }

  async update(user: DashboardUser, id: string, body: LinkInput) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const current = await this.findInProject(id, project.id);

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (body.destinationUrl !== undefined) set('destination_url', this.requireDestination(body.destinationUrl));
    if (body.title !== undefined) set('title', cleanTitle(body.title));
    if (body.expiresAt !== undefined) set('expires_at', parseExpiry(body.expiresAt));
    for (const field of UTM_FIELDS) {
      const value = body[UTM_INPUT_KEYS[field]];
      if (value !== undefined) set(field, cleanUtm(value));
    }
    if (body.slug !== undefined && body.slug.trim().toLowerCase() !== current.slug) {
      const next = normalizeSlug(body.slug);
      if ('error' in next) throw new BadRequestException(next.error);
      const taken = await this.database.query(`SELECT 1 FROM short_links WHERE slug = $1`, [next.slug]);
      if (taken.rowCount > 0) throw new BadRequestException(`The slug "${next.slug}" is already taken.`);
      set('slug', next.slug);
    }
    if (sets.length === 0) return this.serialize(current);

    values.push(id, project.id);
    const updated = await this.database.query<LinkRow>(
      `UPDATE short_links SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${values.length - 1} AND project_id = $${values.length}
        RETURNING *`,
      values
    );
    this.resolveCache.delete(current.slug);
    return this.serialize(updated.rows[0]);
  }

  async setArchived(user: DashboardUser, id: string, archived: boolean, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const result = await this.database.query<LinkRow>(
      `UPDATE short_links SET archived_at = ${archived ? 'now()' : 'NULL'}, updated_at = now()
        WHERE id = $1 AND project_id = $2 RETURNING *`,
      [id, project.id]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Link not found.');
    this.resolveCache.delete(row.slug);
    return this.serialize(row);
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const result = await this.database.query<{ slug: string }>(
      `DELETE FROM short_links WHERE id = $1 AND project_id = $2 RETURNING slug`,
      [id, project.id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Link not found.');
    this.resolveCache.delete(result.rows[0].slug);
    return { deleted: true };
  }

  // -- Public redirect --------------------------------------------------------

  /**
   * Looks up a slug for the redirect and records the click in the background.
   * Tracking problems (quota reached, a slow database) never block the redirect.
   */
  async resolve(rawSlug: string, meta: ClickMeta): Promise<{ destination: string }> {
    const slug = (rawSlug ?? '').trim().toLowerCase();
    const link = await this.lookup(slug);
    if (!link || link.archived_at) throw new NotFoundException('This link does not exist.');
    if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
      throw new GoneException('This link has expired.');
    }

    const destination = withUtm(link.destination_url, this.utmOf(link));
    if (!isBot(meta.userAgent) && this.shouldCount(link.id, meta)) {
      void this.recordClick(link, destination, meta).catch((error: unknown) => {
        this.logger.warn(`Link click for ${link.slug} not recorded: ${error instanceof Error ? error.message : error}`);
      });
    }
    return { destination };
  }

  private async lookup(slug: string): Promise<LinkRow | null> {
    if (!slug || slug.length > 64) return null;
    const cached = this.resolveCache.get(slug);
    if (cached && Date.now() - cached.at < RESOLVE_CACHE_MS) return cached.row;
    const result = await this.database.query<LinkRow>(`SELECT * FROM short_links WHERE slug = $1`, [slug]);
    const row = result.rows[0] ?? null;
    this.resolveCache.set(slug, { row, at: Date.now() });
    return row;
  }

  /** Drops repeat clicks from the same visitor within a few seconds (double taps, refreshes). */
  private shouldCount(linkId: string, meta: ClickMeta): boolean {
    const visitor = visitorIp(meta) ?? 'unknown';
    const key = `${linkId}:${visitor}:${meta.userAgent ?? ''}`;
    const now = Date.now();
    const last = this.recentClicks.get(key);
    if (last && now - last < CLICK_DEDUPE_MS) return false;
    if (this.recentClicks.size >= MAX_DEDUPE_ENTRIES) {
      for (const [entry, at] of this.recentClicks) {
        if (now - at >= CLICK_DEDUPE_MS) this.recentClicks.delete(entry);
      }
      if (this.recentClicks.size >= MAX_DEDUPE_ENTRIES) this.recentClicks.clear();
    }
    this.recentClicks.set(key, now);
    return true;
  }

  private async recordClick(link: LinkRow, destination: string, meta: ClickMeta) {
    const clientIp = visitorIp(meta);
    // Country/region/city only: the raw IP is not stored for link clicks.
    const { country, region, city } = resolveGeo(clientIp, meta.headers ?? {});
    const host = referrerHost(meta.referrer);
    // A stable-per-day anonymous id lets "unique clickers" work without cookies or stored IPs.
    const anonymousId = `lnk_anon_${createHash('sha256')
      .update(`${link.project_id}:${clientIp ?? ''}:${meta.userAgent ?? ''}:${new Date().toISOString().slice(0, 10)}`)
      .digest('hex')
      .slice(0, 24)}`;

    await this.database.transaction(async (client) => {
      await this.usage.consumeProjectEvents(client, link.organization_id, link.project_id, 1);
      await client.query(
        `INSERT INTO events (
           id, organization_id, project_id, user_id, anonymous_id, session_id,
           event_name, properties, device_info, network_info, context, occurred_at
         )
         VALUES ($1, $2, $3, NULL, $4, NULL, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, now())`,
        [
          `evt_${randomUUID()}`,
          link.organization_id,
          link.project_id,
          anonymousId,
          LINK_CLICK_EVENT,
          JSON.stringify({
            linkId: link.id,
            slug: link.slug,
            title: link.title,
            destination,
            ...(host && { referrerHost: host }),
            ...Object.fromEntries(UTM_FIELDS.filter((field) => link[field]).map((field) => [field, link[field]]))
          }),
          JSON.stringify(parseUserAgent(meta.userAgent)),
          JSON.stringify({ ...(country && { country }), ...(region && { region }), ...(city && { city }) }),
          JSON.stringify(meta.referrer ? { page: { referrer: meta.referrer.slice(0, 2048) } } : {})
        ]
      );
      await client.query(
        `UPDATE short_links SET click_count = click_count + 1, last_clicked_at = now() WHERE id = $1`,
        [link.id]
      );
    });
  }

  // -- Helpers ----------------------------------------------------------------

  private async findInProject(id: string, projectId: string): Promise<LinkRow> {
    const result = await this.database.query<LinkRow>(
      `SELECT * FROM short_links WHERE id = $1 AND project_id = $2`,
      [id, projectId]
    );
    if (!result.rows[0]) throw new NotFoundException('Link not found.');
    return result.rows[0];
  }

  private async breakdown(expression: string, scope: string, params: unknown[]) {
    const result = await this.database.query<{ name: string; clicks: number }>(
      `SELECT ${expression} AS name, count(*)::int AS clicks
         FROM events WHERE ${scope} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      params
    );
    return result.rows;
  }

  private requireDestination(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('destinationUrl is required.');
    const result = validateDestination(value, shortLinkBaseUrl());
    if ('error' in result) throw new BadRequestException(result.error);
    return result.url;
  }

  private readUtm(body: LinkInput): UtmValues {
    return Object.fromEntries(UTM_FIELDS.map((field) => [field, cleanUtm(body[UTM_INPUT_KEYS[field]])]));
  }

  private utmOf(row: LinkRow): UtmValues {
    return Object.fromEntries(UTM_FIELDS.map((field) => [field, row[field]]));
  }

  private serialize(row: LinkRow) {
    return {
      id: row.id,
      slug: row.slug,
      shortUrl: `${shortLinkBaseUrl()}/l/${row.slug}`,
      destinationUrl: row.destination_url,
      title: row.title,
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      utmTerm: row.utm_term,
      utmContent: row.utm_content,
      expiresAt: toIso(row.expires_at),
      archivedAt: toIso(row.archived_at),
      clickCount: Number(row.click_count ?? 0),
      lastClickedAt: toIso(row.last_clicked_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at)
    };
  }
}

function visitorIp(meta: ClickMeta): string | undefined {
  const forwarded = meta.clientIp?.trim();
  if (forwarded && /^[0-9a-f.:]{3,45}$/i.test(forwarded)) return forwarded.replace(/^::ffff:/, '');
  return extractClientIp(meta.forwardedFor, meta.ip, meta.realIp);
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function parseExpiry(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new BadRequestException('expiresAt must be a valid date.');
  return date;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function fillDays(rows: Array<{ day: string; clicks: number }>, days: number) {
  const byDay = new Map(rows.map((row) => [row.day, row.clicks]));
  const out: Array<{ day: string; clicks: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day, clicks: byDay.get(day) ?? 0 });
  }
  return out;
}
