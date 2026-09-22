import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { EvidenceItem } from '../tools/tool.interface';
import { AiSanitizerService } from '../context/ai-sanitizer.service';

export interface AiConversation {
  id: string;
  organizationId: string;
  projectId: string;
  createdByUserId: string;
  title: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  investigationId: string | null;
  role: 'user' | 'assistant';
  content: string;
  evidence: EvidenceItem[];
  suggestedFollowups: string[];
  createdAt: string;
}

export interface FindingItem {
  classification: 'observed' | 'correlated' | 'hypothesis';
  statement: string;
  evidenceIds?: string[];
}

export interface AiInvestigation {
  id: string;
  organizationId: string;
  projectId: string;
  conversationId: string | null;
  actorUserId: string;
  surface: string;
  contextType: string | null;
  contextId: string | null;
  question: string;
  status: 'running' | 'completed' | 'failed' | 'insufficient_data' | 'quota_exceeded' | 'timed_out';
  usageCharged: boolean;
  quotaReserved: boolean;
  usagePeriod: string;
  idempotencyKey: string | null;
  toolCallsCount: number;
  evidence: EvidenceItem[];
  findings: FindingItem[];
  suggestedFollowups: string[];
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sanitizer: AiSanitizerService
  ) {}

  async getOrCreateConversation(params: {
    conversationId?: string;
    organizationId: string;
    projectId: string;
    userId: string;
    title?: string;
    source?: string;
  }): Promise<AiConversation> {
    if (params.conversationId) {
      const existing = await this.database.query<any>(
        `SELECT id, organization_id AS "organizationId", project_id AS "projectId",
                created_by_user_id AS "createdByUserId", title, source,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM ai_conversations
         WHERE id = $1 AND project_id = $2 AND organization_id = $3`,
        [params.conversationId, params.projectId, params.organizationId]
      );
      if (existing.rows[0]) {
        return existing.rows[0];
      }
    }

    const id = `conv_${randomUUID()}`;
    const title = (params.title || 'New Investigation').slice(0, 100);
    const source = params.source || 'dashboard';

    const result = await this.database.query<any>(
      `INSERT INTO ai_conversations (id, organization_id, project_id, created_by_user_id, title, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, organization_id AS "organizationId", project_id AS "projectId",
                 created_by_user_id AS "createdByUserId", title, source,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, params.organizationId, params.projectId, params.userId, title, source]
    );

    return result.rows[0];
  }

  async listConversations(organizationId: string, projectId: string, limit = 30): Promise<AiConversation[]> {
    const result = await this.database.query<any>(
      `SELECT id, organization_id AS "organizationId", project_id AS "projectId",
              created_by_user_id AS "createdByUserId", title, source,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_conversations
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC
       LIMIT $3`,
      [projectId, organizationId, Math.min(limit, 50)]
    );
    return result.rows;
  }

  async getConversationMessages(conversationId: string, organizationId: string, projectId: string): Promise<AiMessage[]> {
    // Strictly verify conversation belongs to organization & project (prevent IDOR)
    const convCheck = await this.database.query(
      `SELECT id FROM ai_conversations WHERE id = $1 AND project_id = $2 AND organization_id = $3`,
      [conversationId, projectId, organizationId]
    );
    if (convCheck.rows.length === 0) {
      return [];
    }

    const result = await this.database.query<any>(
      `SELECT id, conversation_id AS "conversationId", investigation_id AS "investigationId",
              role, content, evidence, suggested_followups AS "suggestedFollowups",
              created_at AS "createdAt"
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return result.rows.map((row) => ({
      ...row,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
      suggestedFollowups: Array.isArray(row.suggestedFollowups) ? row.suggestedFollowups : []
    }));
  }

  async getInvestigationByIdempotencyKey(
    organizationId: string,
    projectId: string,
    idempotencyKey: string
  ): Promise<AiInvestigation | null> {
    const result = await this.database.query<any>(
      `SELECT id, organization_id AS "organizationId", project_id AS "projectId",
              conversation_id AS "conversationId", actor_user_id AS "actorUserId",
              surface, context_type AS "contextType", context_id AS "contextId",
              question, status, usage_charged AS "usageCharged",
              quota_reserved AS "quotaReserved", usage_period AS "usagePeriod",
              idempotency_key AS "idempotencyKey", tool_calls_count AS "toolCallsCount",
              evidence, findings, suggested_followups AS "suggestedFollowups",
              started_at AS "startedAt", completed_at AS "completedAt",
              created_at AS "createdAt"
       FROM ai_investigations
       WHERE organization_id = $1 AND project_id = $2 AND idempotency_key = $3`,
      [organizationId, projectId, idempotencyKey]
    );

    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      ...row,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
      findings: Array.isArray(row.findings) ? row.findings : [],
      suggestedFollowups: Array.isArray(row.suggestedFollowups) ? row.suggestedFollowups : []
    };
  }

  async getInvestigation(
    investigationId: string,
    organizationId: string,
    projectId: string
  ): Promise<AiInvestigation | null> {
    const result = await this.database.query<any>(
      `SELECT id, organization_id AS "organizationId", project_id AS "projectId",
              conversation_id AS "conversationId", actor_user_id AS "actorUserId",
              surface, context_type AS "contextType", context_id AS "contextId",
              question, status, usage_charged AS "usageCharged",
              quota_reserved AS "quotaReserved", usage_period AS "usagePeriod",
              idempotency_key AS "idempotencyKey", tool_calls_count AS "toolCallsCount",
              evidence, findings, suggested_followups AS "suggestedFollowups",
              started_at AS "startedAt", completed_at AS "completedAt",
              created_at AS "createdAt"
       FROM ai_investigations
       WHERE id = $1 AND organization_id = $2 AND project_id = $3`,
      [investigationId, organizationId, projectId]
    );

    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      ...row,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
      findings: Array.isArray(row.findings) ? row.findings : [],
      suggestedFollowups: Array.isArray(row.suggestedFollowups) ? row.suggestedFollowups : []
    };
  }

  async createInvestigation(params: {
    investigationId?: string;
    organizationId: string;
    projectId: string;
    conversationId?: string;
    actorUserId: string;
    surface?: string;
    contextType?: string;
    contextId?: string;
    question: string;
    usagePeriod?: string;
    idempotencyKey?: string;
  }): Promise<AiInvestigation> {
    const id = params.investigationId || `inv_${randomUUID()}`;
    const usagePeriod = params.usagePeriod || new Date().toISOString().slice(0, 7);

    try {
      const result = await this.database.query<any>(
        `INSERT INTO ai_investigations (
           id, organization_id, project_id, conversation_id, actor_user_id,
           surface, context_type, context_id, question, status,
           usage_period, idempotency_key, quota_reserved
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'running', $10, $11, false)
         RETURNING id, organization_id AS "organizationId", project_id AS "projectId",
                   conversation_id AS "conversationId", actor_user_id AS "actorUserId",
                   surface, context_type AS "contextType", context_id AS "contextId",
                   question, status, usage_charged AS "usageCharged",
                   quota_reserved AS "quotaReserved", usage_period AS "usagePeriod",
                   idempotency_key AS "idempotencyKey", tool_calls_count AS "toolCallsCount",
                   evidence, findings, suggested_followups AS "suggestedFollowups",
                   started_at AS "startedAt", completed_at AS "completedAt",
                   created_at AS "createdAt"`,
        [
          id,
          params.organizationId,
          params.projectId,
          params.conversationId || null,
          params.actorUserId,
          params.surface || 'global',
          params.contextType || null,
          params.contextId || null,
          params.question,
          usagePeriod,
          params.idempotencyKey || null
        ]
      );

      const row = result.rows[0];
      return {
        ...row,
        evidence: Array.isArray(row.evidence) ? row.evidence : [],
        findings: Array.isArray(row.findings) ? row.findings : [],
        suggestedFollowups: Array.isArray(row.suggestedFollowups) ? row.suggestedFollowups : []
      };
    } catch (err: any) {
      if (params.idempotencyKey && (err?.code === '23505' || err?.message?.includes('ai_investigations_org_idempotency_idx'))) {
        const existing = await this.getInvestigationByIdempotencyKey(params.organizationId, params.projectId, params.idempotencyKey);
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  async updateInvestigation(
    id: string,
    updates: {
      status?: 'running' | 'completed' | 'failed' | 'insufficient_data' | 'quota_exceeded' | 'timed_out';
      usageCharged?: boolean;
      quotaReserved?: boolean;
      toolCallsCount?: number;
      evidence?: EvidenceItem[];
      findings?: FindingItem[];
      suggestedFollowups?: string[];
      completedAt?: Date;
    }
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.usageCharged !== undefined) {
      fields.push(`usage_charged = $${idx++}`);
      values.push(updates.usageCharged);
    }
    if (updates.quotaReserved !== undefined) {
      fields.push(`quota_reserved = $${idx++}`);
      values.push(updates.quotaReserved);
    }
    if (updates.toolCallsCount !== undefined) {
      fields.push(`tool_calls_count = $${idx++}`);
      values.push(updates.toolCallsCount);
    }
    if (updates.evidence !== undefined) {
      // Defensive sanitization of all persisted evidence
      const sanitizedEvidence = this.sanitizer.sanitizeData(updates.evidence);
      fields.push(`evidence = $${idx++}::jsonb`);
      values.push(JSON.stringify(sanitizedEvidence));
    }
    if (updates.findings !== undefined) {
      fields.push(`findings = $${idx++}::jsonb`);
      values.push(JSON.stringify(updates.findings));
    }
    if (updates.suggestedFollowups !== undefined) {
      fields.push(`suggested_followups = $${idx++}::jsonb`);
      values.push(JSON.stringify(updates.suggestedFollowups));
    }
    if (updates.completedAt !== undefined) {
      fields.push(`completed_at = $${idx++}`);
      values.push(updates.completedAt.toISOString());
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.database.query(
      `UPDATE ai_investigations SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async recordMessage(params: {
    conversationId: string;
    investigationId?: string;
    role: 'user' | 'assistant';
    content: string;
    evidence?: EvidenceItem[];
    suggestedFollowups?: string[];
  }): Promise<AiMessage> {
    const id = `msg_${randomUUID()}`;
    // Defensive sanitization of evidence before storing in message record
    const sanitizedEvidence = this.sanitizer.sanitizeData(params.evidence || []);
    const evidenceJson = JSON.stringify(sanitizedEvidence);
    const followupsJson = JSON.stringify(params.suggestedFollowups || []);

    const result = await this.database.query<any>(
      `INSERT INTO ai_messages (id, conversation_id, investigation_id, role, content, evidence, suggested_followups)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       RETURNING id, conversation_id AS "conversationId", investigation_id AS "investigationId",
                 role, content, evidence, suggested_followups AS "suggestedFollowups",
                 created_at AS "createdAt"`,
      [
        id,
        params.conversationId,
        params.investigationId || null,
        params.role,
        params.content,
        evidenceJson,
        followupsJson
      ]
    );

    // Update conversation timestamp
    await this.database.query(
      `UPDATE ai_conversations SET updated_at = now() WHERE id = $1`,
      [params.conversationId]
    );

    return {
      ...result.rows[0],
      evidence: sanitizedEvidence,
      suggestedFollowups: params.suggestedFollowups || []
    };
  }
}

