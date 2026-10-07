import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Res
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import {
  CreateSecretDto,
  CreateSyntheticMonitorDto,
  SyntheticMonitoringService,
  UpdateSyntheticMonitorDto
} from './synthetic-monitoring.service';
import { SyntheticArtifactService } from './synthetic-artifact.service';
import { ProjectsService } from '../projects/projects.service';

@Controller('v1/dashboard')
export class SyntheticMonitoringController {
  constructor(
    private readonly authService: AuthService,
    private readonly syntheticService: SyntheticMonitoringService,
    private readonly artifacts: SyntheticArtifactService,
    private readonly projects: ProjectsService
  ) {}

  // ---------------------------------------------------------------------------
  // REPLAY DRAFTS
  // ---------------------------------------------------------------------------

  @Get('replays/:id/synthetic-draft')
  async getReplayDraft(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.getReplayDraft(user, id, projectId);
  }

  @Get('synthetic-drafts/replay/:id')
  async getReplayDraftAlias(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.getReplayDraft(user, id, projectId);
  }

  // ---------------------------------------------------------------------------
  // MONITORS
  // ---------------------------------------------------------------------------

  @Get('synthetic-monitors')
  async list(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.list(user, projectId);
  }

  @Get('synthetic-monitors/:id')
  async get(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.get(user, id, projectId);
  }

  @Post('synthetic-monitors')
  async create(
    @Body() body: CreateSyntheticMonitorDto,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.create(user, body);
  }

  @Put('synthetic-monitors/:id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateSyntheticMonitorDto,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.update(user, id, body, projectId);
  }

  @Delete('synthetic-monitors/:id')
  async delete(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.delete(user, id, projectId);
  }

  @Post('synthetic-monitors/:id/run')
  async triggerRun(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.triggerManualRun(user, id, projectId);
  }

  @Post('synthetic-monitors/:id/pause')
  async pause(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.pause(user, id, projectId);
  }

  @Post('synthetic-monitors/:id/resume')
  async resume(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.resume(user, id, projectId);
  }

  @Get('synthetic-monitors/:id/runs')
  async listRuns(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.listRuns(user, id, limit ? parseInt(limit, 10) : 30, projectId);
  }

  @Get('synthetic-runs/:runId')
  async getRun(
    @Param('runId') runId: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.getRun(user, runId, projectId);
  }

  // ---------------------------------------------------------------------------
  // SECRETS
  // ---------------------------------------------------------------------------

  @Get('synthetic-secrets')
  async listSecrets(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.listSecrets(user, projectId);
  }

  @Post('synthetic-secrets')
  async createSecret(
    @Body() body: CreateSecretDto,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.createSecret(user, body);
  }

  @Delete('synthetic-secrets/:name')
  async deleteSecret(
    @Param('name') name: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:write');
    return this.syntheticService.deleteSecret(user, name, projectId);
  }

  // ---------------------------------------------------------------------------
  // ARTIFACTS
  // ---------------------------------------------------------------------------

  @Get('synthetic-runs/:runId/artifacts')
  async listArtifacts(
    @Param('runId') runId: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    const project = await this.projects.requireActiveProject(user, projectId);
    return this.artifacts.listRunArtifacts(project.id, runId);
  }

  @Get('synthetic-runs/:runId/artifacts/:artifactId')
  async getArtifact(
    @Param('runId') runId: string,
    @Param('artifactId') artifactId: string,
    @Res() res: Response,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    const project = await this.projects.requireActiveProject(user, projectId);

    const { buffer, mimeType } = await this.artifacts.getArtifact(project.id, runId, artifactId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  }

  // ---------------------------------------------------------------------------
  // CI RUN GROUPS (DASHBOARD)
  // ---------------------------------------------------------------------------

  @Get('synthetic-ci-groups')
  async listCiGroups(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'synthetic_monitors:read');
    return this.syntheticService.listCiRunGroups(user, projectId, limit ? Number(limit) : undefined);
  }
}

