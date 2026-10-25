import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExperimentsService } from '../src/modules/experiments/experiments.service';
import { mockDatabase, rows } from './helpers/mock-db';

const PROJECT = {
  id: 'proj_1',
  name: 'TraceIQ Web',
  slug: 'traceiq-web',
  organizationId: 'org_1',
  organizationName: 'Acme',
  role: 'owner'
};

const USER = {
  id: 'usr_1',
  email: 'admin@traceiq.test',
  authMethod: 'supabase' as const
};

function makeService(dbQueries?: (sql: string, params?: any[]) => any) {
  const db = mockDatabase(dbQueries || (() => rows([])));
  const projects = {
    resolveActiveProject: vi.fn().mockImplementation(async (_u, projId) => {
      if (projId && projId !== PROJECT.id) return null;
      return PROJECT;
    })
  };
  const service = new ExperimentsService(db as any, projects as any);
  return { service, db, projects };
}

describe('ExperimentsService - Unit & Integration Tests', () => {
  it('enforces tenant isolation and throws when project is inaccessible', async () => {
    const { service, projects } = makeService();
    projects.resolveActiveProject.mockResolvedValueOnce(null);

    await expect(service.get(USER, 'exp_1', 'other_proj')).rejects.toThrow(NotFoundException);
  });

  it('validates experiment key format, name, and primary metric on create and update', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('SELECT * FROM experiments')) {
        return rows([{
          id: 'exp_1',
          project_id: PROJECT.id,
          key: 'valid-key',
          name: 'Valid Exp',
          primary_metric: 'existing_metric',
          variants: []
        }]);
      }
      return rows([]);
    });

    await expect(
      service.create(USER, {
        projectId: PROJECT.id,
        key: 'INVALID KEY WITH SPACES',
        name: 'Test Exp',
        primaryMetric: 'signup_completed'
      })
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(USER, {
        projectId: PROJECT.id,
        key: 'valid-key',
        name: '',
        primaryMetric: 'signup_completed'
      })
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(USER, {
        projectId: PROJECT.id,
        key: 'valid-key',
        name: 'Valid Name',
        primaryMetric: '' // Missing primary metric
      })
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(USER, {
        projectId: PROJECT.id,
        key: 'valid-key',
        name: 'Valid Name',
        primaryMetric: '   ' // Blank whitespace metric
      })
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.update(USER, 'exp_1', {
        primaryMetric: '' // Cannot update to empty metric
      }, PROJECT.id)
    ).rejects.toThrow(BadRequestException);
  });

  it('supports direct navigation lookup by experiment id or key across accessible projects', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('SELECT e.project_id FROM experiments e') || sql.includes('FROM experiments e')) {
        return rows([{ project_id: PROJECT.id }]);
      }
      if (sql.includes('FROM experiments')) {
        return rows([
          {
            id: 'exp_direct_1',
            project_id: PROJECT.id,
            key: 'direct-slug',
            name: 'Direct Route Exp',
            status: 'draft',
            environment: 'production',
            primary_metric: 'checkout_success',
            secondary_metrics: [],
            variants: [{ id: 'v1', key: 'control', name: 'Control', weight: 100, isControl: true }],
            target_percentage: 100,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      }
      if (sql.includes('SELECT variant_key, count(DISTINCT distinct_id)')) {
        return rows([]);
      }
      if (sql.includes('SELECT exp.variant_key, count(DISTINCT ev.distinct_id)')) {
        return rows([]);
      }
      if (sql.includes('SELECT to_char(exp.occurred_at')) {
        return rows([]);
      }
      return rows([]);
    });

    // Lookup by ID without explicit projectId (e.g. direct URL navigation)
    const byId = await service.get(USER, 'exp_direct_1');
    expect(byId.experiment.id).toBe('exp_direct_1');
    expect(byId.project.id).toBe(PROJECT.id);

    // Lookup by Key without explicit projectId
    const byKey = await service.get(USER, 'direct-slug');
    expect(byKey.experiment.key).toBe('direct-slug');
    expect(byKey.project.id).toBe(PROJECT.id);
  });

  it('creates an experiment with default control and variant with normalized weights', async () => {
    let insertedRow: any = null;
    const { service } = makeService((sql, params) => {
      if (sql.includes('INSERT INTO experiments')) {
        insertedRow = {
          id: params?.[0],
          project_id: params?.[1],
          key: params?.[2],
          name: params?.[3],
          description: params?.[4],
          status: 'draft',
          environment: params?.[5],
          primary_metric: params?.[6],
          secondary_metrics: JSON.parse(params?.[7] || '[]'),
          variants: JSON.parse(params?.[8] || '[]'),
          audience_filter: JSON.parse(params?.[9] || '{}'),
          target_percentage: params?.[10],
          created_by_user_id: params?.[11],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        return rows([insertedRow]);
      }
      return rows([]);
    });

    const created = await service.create(USER, {
      projectId: PROJECT.id,
      key: 'cta-color-test',
      name: 'CTA Button Color Test',
      description: 'Testing green vs blue CTA button conversion',
      primaryMetric: 'checkout_completed',
      secondaryMetrics: ['button_clicked'],
      variants: [
        { key: 'blue_control', name: 'Blue (Control)', weight: 50, isControl: true },
        { key: 'green_variant', name: 'Green CTA', weight: 50, isControl: false }
      ]
    });

    expect(created.id).toMatch(/^exp_/);
    expect(created.key).toBe('cta-color-test');
    expect(created.primaryMetric).toBe('checkout_completed');
    expect(created.variants.length).toBe(2);
    expect(created.variants[0].isControl).toBe(true);
    expect(created.variants[0].weight + created.variants[1].weight).toBe(100);
  });

  it('performs deterministic variant assignment for distinct IDs', () => {
    const { service } = makeService();
    const experiment = {
      id: 'exp_deterministic_123',
      projectId: 'proj_1',
      key: 'checkout-v2',
      name: 'Checkout V2',
      status: 'running' as const,
      environment: 'production',
      primaryMetric: 'purchase',
      secondaryMetrics: [],
      variants: [
        { id: 'v1', key: 'control', name: 'Control', weight: 50, isControl: true },
        { id: 'v2', key: 'variant_b', name: 'Variant B', weight: 50, isControl: false }
      ],
      targetPercentage: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // User A should always get the exact same variant across repeated evaluations
    const res1 = service.assignVariant(experiment, 'user_alice_123');
    const res2 = service.assignVariant(experiment, 'user_alice_123');
    const res3 = service.assignVariant(experiment, 'user_alice_123');

    expect(res1).not.toBeNull();
    expect(res1?.key).toBe(res2?.key);
    expect(res2?.key).toBe(res3?.key);
  });

  it('evaluates audience rules properly', () => {
    const { service } = makeService();
    const experiment = {
      id: 'exp_audience_test',
      projectId: 'proj_1',
      key: 'pro-feature-test',
      name: 'Pro Feature Test',
      status: 'running' as const,
      environment: 'production',
      primaryMetric: 'feature_used',
      secondaryMetrics: [],
      variants: [
        { id: 'v1', key: 'control', name: 'Control', weight: 50, isControl: true },
        { id: 'v2', key: 'test_group', name: 'Test Group', weight: 50, isControl: false }
      ],
      audienceFilter: {
        rules: [
          { property: 'plan', operator: 'eq' as const, value: 'enterprise' }
        ]
      },
      targetPercentage: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const freeUser = service.assignVariant(experiment, 'user_free_1', { plan: 'free' });
    const enterpriseUser = service.assignVariant(experiment, 'user_ent_1', { plan: 'enterprise' });

    expect(freeUser).toBeNull();
    expect(enterpriseUser).not.toBeNull();
  });

  it('calculates conversion results with uplift and statistical significance', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('FROM experiments')) {
        return rows([
          {
            id: 'exp_stats_1',
            project_id: PROJECT.id,
            key: 'stats-test',
            name: 'Stats Test',
            status: 'running',
            environment: 'production',
            primary_metric: 'purchase',
            secondary_metrics: [],
            variants: [
              { id: 'v1', key: 'control', name: 'Control', weight: 50, isControl: true },
              { id: 'v2', key: 'variant_b', name: 'Variant B', weight: 50, isControl: false }
            ],
            target_percentage: 100,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      }
      if (sql.includes('SELECT variant_key, count(DISTINCT distinct_id)')) {
        return rows([
          { variant_key: 'control', exposure_count: '1000' },
          { variant_key: 'variant_b', exposure_count: '1000' }
        ]);
      }
      if (sql.includes('SELECT exp.variant_key, count(DISTINCT ev.distinct_id)')) {
        return rows([
          { variant_key: 'control', conversion_count: '100' }, // 10% conversion rate
          { variant_key: 'variant_b', conversion_count: '150' } // 15% conversion rate -> +50% uplift
        ]);
      }
      return rows([]);
    });

    const results = await service.getResults(USER, 'exp_stats_1', PROJECT.id);

    expect(results.totalExposures).toBe(2000);
    expect(results.totalConversions).toBe(250);

    const control = results.variants.find((v) => v.isControl);
    const variantB = results.variants.find((v) => !v.isControl);

    expect(control?.conversionRate).toBe(0.1);
    expect(variantB?.conversionRate).toBe(0.15);
    expect(variantB?.uplift).toBe(50); // +50% uplift
    expect(variantB?.isSignificant).toBe(true);
    expect(variantB?.confidence).toBeGreaterThan(99);
    expect(results.recommendedWinner).toBe('variant_b');
  });

  it('handles lifecycle status updates (running, paused, completed)', async () => {
    let updatedStatus: any = null;
    const { service } = makeService((sql, params) => {
      if (sql.includes('UPDATE experiments')) {
        updatedStatus = params?.[0];
        return rows([{ id: 'exp_1', project_id: PROJECT.id, status: updatedStatus, variants: [] }]);
      }
      if (sql.includes('FROM experiments')) {
        return rows([{ id: 'exp_1', project_id: PROJECT.id, status: 'draft', variants: [] }]);
      }
      return rows([]);
    });

    await service.updateStatus(USER, 'exp_1', 'running', undefined, PROJECT.id);
    expect(updatedStatus).toBe('running');

    await service.updateStatus(USER, 'exp_1', 'completed', 'variant_b', PROJECT.id);
    expect(updatedStatus).toBe('completed');
  });
});
