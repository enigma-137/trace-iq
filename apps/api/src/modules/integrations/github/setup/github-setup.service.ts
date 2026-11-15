import { ConflictException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { DashboardUser } from '../../../auth/auth.service';
import { GitHubApiError, GitHubAppClient, GitHubPullRequest, GitHubRepo } from '../github-app.client';
import { GitHubService, dashboardUrl, toHttpError } from '../github.service';
import { SETUP_BRANCH, SetupGenerationError, SetupPlan, generateSetup } from './setup-generator';
import { DetectedApp, Detection, RepoSnapshot, detectStack } from './stack-detection';

/** Files the detector may read; it never needs more than a handful. */
const MAX_FILE_READS = 40;
/** Files shown to the person before the PR is opened. */
export type PlanSummary = {
  files: Array<{ path: string; action: 'create' | 'update' }>;
  envVars: Array<{ name: string; secret: boolean; exampleValue: string; description: string }>;
  manualSteps: string[];
  installCommand: string;
};

export type SetupPreview =
  | { status: 'ready'; app: DetectedApp; plan: PlanSummary; existingPullRequest: GitHubPullRequest | null }
  | { status: 'pick_folder'; candidates: DetectedApp[] }
  | { status: 'unsupported' | 'already_installed' | 'file_exists' | 'invalid_output'; app: DetectedApp; message: string }
  | { status: 'pull_request_open'; pullRequest: GitHubPullRequest };

/**
 * "Connect GitHub → we set it up": detects the stack of the project's linked repository,
 * generates the change and opens a pull request on the `traceiq/setup` branch. Never
 * touches the default branch (the client refuses it). Idempotent: an open setup PR is
 * returned as is, an existing branch is reused, and identical content is not committed again.
 */
@Injectable()
export class GitHubSetupService {
  private readonly logger = new Logger(GitHubSetupService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly githubService: GitHubService,
    private readonly github: GitHubAppClient
  ) {}

  async preview(user: DashboardUser, projectId: string): Promise<SetupPreview> {
    const { project, installation, link } = await this.githubService.requireLinkedProject(user, projectId);
    const installationId = Number(installation.installationId);
    try {
      const repo = await this.github.getRepo(installationId, link.repoFullName);
      const open = await this.github.findOpenPullRequest(installationId, repo, SETUP_BRANCH);
      if (open) return { status: 'pull_request_open', pullRequest: open };
      const outcome = await this.plan(installationId, repo, link.appSubdirectory, project);
      if (outcome.kind === 'pick_folder') return { status: 'pick_folder', candidates: outcome.candidates };
      if (outcome.kind === 'error') return { status: statusFor(outcome.error), app: outcome.app, message: outcome.error.message };
      return { status: 'ready', app: outcome.plan.app, plan: summarize(outcome.plan), existingPullRequest: null };
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async createSetupPullRequest(user: DashboardUser, projectId: string) {
    const { project, installation, link } = await this.githubService.requireLinkedProject(user, projectId);
    const installationId = Number(installation.installationId);
    try {
      const repo = await this.github.getRepo(installationId, link.repoFullName);

      // Idempotent: an open setup PR is the answer.
      const open = await this.github.findOpenPullRequest(installationId, repo, SETUP_BRANCH);
      if (open) {
        await this.record(project.id, repo, open, null, link.appSubdirectory, user.id);
        return { created: false, pullRequest: open };
      }

      const outcome = await this.plan(installationId, repo, link.appSubdirectory, project);
      if (outcome.kind === 'pick_folder') {
        throw new ConflictException({
          code: 'SETUP_PICK_FOLDER',
          message: 'This repository has several apps. Choose the app folder first.',
          candidates: outcome.candidates
        });
      }
      if (outcome.kind === 'error') {
        throw new UnprocessableEntityException({ code: outcome.error.code, message: outcome.error.message, app: outcome.app });
      }
      const { plan } = outcome;

      // Branch from the default branch, or reuse the setup branch left by an earlier attempt.
      const branchExists = Boolean(await this.github.getBranchSha(installationId, repo.fullName, SETUP_BRANCH));
      if (!branchExists) {
        const baseSha = await this.github.getBranchSha(installationId, repo.fullName, repo.defaultBranch);
        if (!baseSha) throw new GitHubApiError(`The default branch ${repo.defaultBranch} was not found.`, 404);
        try {
          await this.github.createBranch(installationId, repo, SETUP_BRANCH, baseSha);
        } catch (error) {
          // Created by a concurrent request in the meantime: use it.
          if (!(error instanceof GitHubApiError && error.status === 422)) throw error;
        }
      }

      await this.github.commitFiles(
        installationId,
        repo,
        SETUP_BRANCH,
        plan.files.map((file) => ({ path: file.path, content: file.content })),
        'Set up TraceIQ analytics'
      );

      let pullRequest: GitHubPullRequest;
      let created = true;
      try {
        pullRequest = await this.github.createPullRequest(installationId, repo, { head: SETUP_BRANCH, title: plan.title, body: plan.body });
      } catch (error) {
        // "A pull request already exists": a concurrent request opened it.
        if (!(error instanceof GitHubApiError && error.status === 422)) throw error;
        const existing = await this.github.findOpenPullRequest(installationId, repo, SETUP_BRANCH);
        if (!existing) throw error;
        pullRequest = existing;
        created = false;
      }

      await this.record(project.id, repo, pullRequest, plan.app.label, plan.app.folder, user.id);
      return { created, pullRequest, app: plan.app, plan: summarize(plan) };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof UnprocessableEntityException) throw error;
      this.logger.warn(`Setup PR failed for project ${project.id}: ${error instanceof Error ? error.name : 'unknown error'}`);
      throw toHttpError(error);
    }
  }

  private async plan(
    installationId: number,
    repo: GitHubRepo,
    subdirectory: string,
    project: { id: string; name: string }
  ): Promise<{ kind: 'plan'; plan: SetupPlan } | { kind: 'pick_folder'; candidates: DetectedApp[] } | { kind: 'error'; error: SetupGenerationError; app: DetectedApp }> {
    const snapshot = await this.snapshot(installationId, repo);
    const detection: Detection = await detectStack(snapshot, subdirectory);
    if (detection.kind === 'pick_folder') return { kind: 'pick_folder', candidates: detection.candidates };
    try {
      const plan = await generateSetup(detection.app, snapshot, {
        projectId: project.id,
        projectName: project.name,
        apiUrl: publicApiUrl(),
        dashboardUrl: dashboardUrl()
      });
      return { kind: 'plan', plan };
    } catch (error) {
      if (error instanceof SetupGenerationError) return { kind: 'error', error, app: detection.app };
      throw error;
    }
  }

  /** The default branch's file list, with cached, capped file reads. */
  private async snapshot(installationId: number, repo: GitHubRepo): Promise<RepoSnapshot> {
    const tree = await this.github.getTree(installationId, repo.fullName, repo.defaultBranch);
    const paths = tree.entries.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
    const known = new Set(paths);
    const cache = new Map<string, Promise<string | null>>();
    return {
      paths,
      read: (path: string) => {
        // On a truncated tree a file may exist without being listed; try it anyway.
        if (!known.has(path) && !tree.truncated) return Promise.resolve(null);
        const cached = cache.get(path);
        if (cached) return cached;
        if (cache.size >= MAX_FILE_READS) return Promise.resolve(null);
        const reading = this.github.readFile(installationId, repo.fullName, path, repo.defaultBranch);
        cache.set(path, reading);
        return reading;
      }
    };
  }

  private async record(projectId: string, repo: GitHubRepo, pull: GitHubPullRequest, label: string | null, folder: string, userId: string) {
    await this.database.query(
      `INSERT INTO github_setup_pull_requests
         (project_id, repo_full_name, branch, pr_number, url, framework_label, app_subdirectory, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (project_id) DO UPDATE SET
         repo_full_name = EXCLUDED.repo_full_name,
         branch = EXCLUDED.branch,
         pr_number = EXCLUDED.pr_number,
         url = EXCLUDED.url,
         framework_label = COALESCE(EXCLUDED.framework_label, github_setup_pull_requests.framework_label),
         app_subdirectory = EXCLUDED.app_subdirectory,
         updated_at = now()`,
      [projectId, repo.fullName, SETUP_BRANCH, pull.number, pull.url, label, folder, userId]
    );
  }
}

function summarize(plan: SetupPlan): PlanSummary {
  return {
    files: plan.files.map((file) => ({ path: file.path, action: file.action })),
    envVars: plan.envVars.map((item) => ({ name: item.name, secret: item.secret, exampleValue: item.exampleValue, description: item.description })),
    manualSteps: plan.manualSteps,
    installCommand: plan.installCommand
  };
}

function statusFor(error: SetupGenerationError): 'unsupported' | 'already_installed' | 'file_exists' | 'invalid_output' {
  if (error.code === 'SETUP_ALREADY_INSTALLED') return 'already_installed';
  if (error.code === 'SETUP_FILE_EXISTS') return 'file_exists';
  if (error.code === 'SETUP_INVALID_OUTPUT') return 'invalid_output';
  return 'unsupported';
}

/** The endpoint generated code sends to: this API's public URL. */
export function publicApiUrl(): string {
  return (process.env.TRACEIQ_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '') || 'https://api.traceiq.run';
}
