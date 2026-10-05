import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SurveysService } from '../src/modules/surveys/surveys.service';
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
  const service = new SurveysService(db as any, projects as any);
  return { service, db, projects };
}

describe('SurveysService - Unit & Integration Tests', () => {
  it('enforces tenant isolation and throws when project is inaccessible', async () => {
    const { service, projects } = makeService();
    projects.resolveActiveProject.mockResolvedValueOnce(null);

    await expect(service.get(USER, 'srv_1', 'other_proj')).rejects.toThrow(NotFoundException);
  });

  it('validates targeting rules and prevents empty event triggers from persisting', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('SELECT * FROM surveys')) {
        return rows([{
          id: 'srv_test_1',
          project_id: PROJECT.id,
          name: 'Test Survey',
          targeting: { type: 'all' },
          questions: []
        }]);
      }
      return rows([]);
    });

    // Empty event name on create
    await expect(
      service.create(USER, {
        projectId: PROJECT.id,
        name: 'Event Triggered Survey',
        targeting: {
          type: 'event',
          eventName: ''
        }
      })
    ).rejects.toThrow(BadRequestException);

    // Whitespace event name on create
    await expect(
      service.create(USER, {
        projectId: PROJECT.id,
        name: 'Event Triggered Survey',
        targeting: {
          type: 'event',
          eventName: '   '
        }
      })
    ).rejects.toThrow(BadRequestException);

    // Empty event name on update
    await expect(
      service.update(USER, 'srv_test_1', {
        targeting: {
          type: 'event',
          eventName: ''
        }
      }, PROJECT.id)
    ).rejects.toThrow(BadRequestException);

    // Incomplete property targeting on create
    await expect(
      service.create(USER, {
        projectId: PROJECT.id,
        name: 'Property Survey',
        targeting: {
          type: 'property',
          propertyKey: '',
          propertyValue: 'enterprise'
        }
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('supports direct navigation lookup by survey id across accessible projects', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('SELECT s.project_id FROM surveys s')) {
        return rows([{ project_id: PROJECT.id }]);
      }
      if (sql.includes('SELECT * FROM surveys WHERE id = $1')) {
        return rows([
          {
            id: 'srv_direct_1',
            project_id: PROJECT.id,
            name: 'Direct Survey',
            status: 'draft',
            environment: 'production',
            questions: [],
            targeting: { type: 'all' },
            display_trigger: { type: 'immediate' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      }
      if (sql.includes('FROM survey_interactions')) {
        return rows([]);
      }
      if (sql.includes('FROM survey_responses')) {
        return rows([]);
      }
      return rows([]);
    });

    const res = await service.get(USER, 'srv_direct_1');
    expect(res.survey.id).toBe('srv_direct_1');
    expect(res.project.id).toBe(PROJECT.id);
  });

  it('creates a survey with question types and targeting', async () => {
    let insertedRow: any = null;
    const { service } = makeService((sql, params) => {
      if (sql.includes('INSERT INTO surveys')) {
        insertedRow = {
          id: params?.[0],
          project_id: params?.[1],
          name: params?.[2],
          description: params?.[3],
          status: 'draft',
          environment: params?.[4],
          questions: JSON.parse(params?.[5] || '[]'),
          targeting: JSON.parse(params?.[6] || '{}'),
          display_trigger: JSON.parse(params?.[7] || '{}'),
          created_by_user_id: params?.[8],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        return rows([insertedRow]);
      }
      return rows([]);
    });

    const created = await service.create(USER, {
      projectId: PROJECT.id,
      name: 'Customer Satisfaction Q4',
      description: 'Quarterly CSAT & NPS feedback',
      questions: [
        {
          id: 'q1',
          type: 'nps',
          prompt: 'How likely are you to recommend TraceIQ to a colleague?',
          required: true
        },
        {
          id: 'q2',
          type: 'single_choice',
          prompt: 'What is your primary role?',
          required: false,
          options: [
            { id: 'opt_1', label: 'Engineer', value: 'engineer' },
            { id: 'opt_2', label: 'Product Manager', value: 'pm' },
            { id: 'opt_3', label: 'Executive', value: 'exec' }
          ]
        },
        {
          id: 'q3',
          type: 'long_text',
          prompt: 'What can we improve?',
          required: false
        }
      ],
      targeting: {
        type: 'all'
      }
    });

    expect(created.id).toMatch(/^srv_/);
    expect(created.name).toBe('Customer Satisfaction Q4');
    expect(created.questions.length).toBe(3);
    expect(created.questions[0].type).toBe('nps');
    expect(created.questions[1].type).toBe('single_choice');
    expect(created.questions[1].options?.length).toBe(3);
  });

  it('filters eligible surveys and prevents re-prompting users who completed or dismissed', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('FROM survey_interactions')) {
        // User already dismissed srv_2
        return rows([{ survey_id: 'srv_2' }]);
      }
      if (sql.includes('FROM surveys')) {
        return rows([
          {
            id: 'srv_1',
            project_id: PROJECT.id,
            name: 'Feedback Survey',
            status: 'published',
            environment: 'production',
            questions: [],
            targeting: { type: 'all' },
            display_trigger: { type: 'immediate' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'srv_2',
            project_id: PROJECT.id,
            name: 'Dismissed Survey',
            status: 'published',
            environment: 'production',
            questions: [],
            targeting: { type: 'all' },
            display_trigger: { type: 'immediate' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      }
      return rows([]);
    });

    const result = await service.getEligibleSurveys(
      'mock_write_key',
      PROJECT.id,
      'user_distinct_456',
      {},
      undefined,
      'production'
    );

    expect(result.surveys.length).toBe(1);
    expect(result.surveys[0].id).toBe('srv_1');
  });

  it('submits survey responses and logs interaction completion', async () => {
    let interactionRecorded = false;
    let responseRecorded = false;

    const { service } = makeService((sql) => {
      if (sql.includes('INSERT INTO survey_responses')) {
        responseRecorded = true;
        return rows([]);
      }
      if (sql.includes('INSERT INTO survey_interactions')) {
        interactionRecorded = true;
        return rows([]);
      }
      return rows([]);
    });

    const res = await service.submitResponse('mock_write_key', PROJECT.id, {
      surveyId: 'srv_1',
      distinctId: 'distinct_789',
      answers: [
        {
          questionId: 'q1',
          questionType: 'nps',
          prompt: 'How likely are you to recommend?',
          score: 10
        },
        {
          questionId: 'q3',
          questionType: 'long_text',
          prompt: 'What can we improve?',
          answerText: 'Great product, love the real-time replay.'
        }
      ]
    });

    expect(res.success).toBe(true);
    expect(responseRecorded).toBe(true);
    expect(interactionRecorded).toBe(true);
  });

  it('calculates NPS score, rating average, and question distributions', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('SELECT * FROM surveys WHERE id = $1')) {
        return rows([
          {
            id: 'srv_nps_test',
            project_id: PROJECT.id,
            name: 'NPS Survey',
            status: 'published',
            environment: 'production',
            questions: [
              {
                id: 'q_nps',
                type: 'nps',
                prompt: 'NPS Question',
                required: true
              },
              {
                id: 'q_rate',
                type: 'rating_scale',
                prompt: 'Rate 1 to 5',
                minRating: 1,
                maxRating: 5,
                required: true
              },
              {
                id: 'q_text',
                type: 'long_text',
                prompt: 'Any comments?',
                required: false
              }
            ],
            targeting: { type: 'all' },
            display_trigger: { type: 'immediate' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      }
      if (sql.includes('FROM survey_interactions')) {
        return rows([
          { action: 'impression', count: '100' },
          { action: 'dismiss', count: '20' }
        ]);
      }
      if (sql.includes('FROM survey_responses')) {
        return rows([
          // 4 Promoters (score 9-10), 0 Passives (7-8), 1 Detractor (score 0-6) -> NPS = (4/5 - 1/5) * 100 = +60
          {
            id: 'r1',
            survey_id: 'srv_nps_test',
            distinct_id: 'u1',
            answers: [
              { questionId: 'q_nps', score: 10 },
              { questionId: 'q_rate', rating: 5 },
              { questionId: 'q_text', answerText: 'Awesome!' }
            ],
            occurred_at: new Date().toISOString(),
            received_at: new Date().toISOString()
          },
          {
            id: 'r2',
            survey_id: 'srv_nps_test',
            distinct_id: 'u2',
            answers: [{ questionId: 'q_nps', score: 9 }, { questionId: 'q_rate', rating: 4 }],
            occurred_at: new Date().toISOString(),
            received_at: new Date().toISOString()
          },
          {
            id: 'r3',
            survey_id: 'srv_nps_test',
            distinct_id: 'u3',
            answers: [{ questionId: 'q_nps', score: 10 }, { questionId: 'q_rate', rating: 5 }],
            occurred_at: new Date().toISOString(),
            received_at: new Date().toISOString()
          },
          {
            id: 'r4',
            survey_id: 'srv_nps_test',
            distinct_id: 'u4',
            answers: [{ questionId: 'q_nps', score: 9 }, { questionId: 'q_rate', rating: 4 }],
            occurred_at: new Date().toISOString(),
            received_at: new Date().toISOString()
          },
          {
            id: 'r5',
            survey_id: 'srv_nps_test',
            distinct_id: 'u5',
            answers: [
              { questionId: 'q_nps', score: 3 },
              { questionId: 'q_rate', rating: 2 },
              { questionId: 'q_text', answerText: 'Needs better docs' }
            ],
            occurred_at: new Date().toISOString(),
            received_at: new Date().toISOString()
          }
        ]);
      }
      return rows([]);
    });

    const results = await service.getResults(USER, 'srv_nps_test', PROJECT.id);

    expect(results.impressionsCount).toBe(100);
    expect(results.responsesCount).toBe(5);
    expect(results.responseRate).toBe(5); // 5 / 100 * 100 = 5.0%

    const npsDist = results.questions.find((q) => q.questionId === 'q_nps');
    expect(npsDist?.promoters).toBe(4);
    expect(npsDist?.detractors).toBe(1);
    expect(npsDist?.npsScore).toBe(60); // 80% - 20% = +60

    const ratingDist = results.questions.find((q) => q.questionId === 'q_rate');
    expect(ratingDist?.averageRating).toBe(4); // (5+4+5+4+2)/5 = 20/5 = 4.0

    const textDist = results.questions.find((q) => q.questionId === 'q_text');
    expect(textDist?.recentTextAnswers?.length).toBe(2);
  });
});
