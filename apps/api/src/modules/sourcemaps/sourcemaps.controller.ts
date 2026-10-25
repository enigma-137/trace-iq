import { Body, Controller, ForbiddenException, Get, Headers, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, DashboardUser } from '../auth/auth.service';
import { SourceMapsService } from './sourcemaps.service';

/**
 * Source map uploads, used by `traceiq sourcemaps upload` in CI. The body of a
 * PUT is the raw map JSON (optionally gzip-encoded); main.ts reads it with a
 * larger size limit than other routes.
 */
@Controller('v1/sourcemaps')
export class SourceMapsController {
  constructor(
    private readonly authService: AuthService,
    private readonly sourceMaps: SourceMapsService
  ) {}

  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Put()
  async upload(
    @Body() body: unknown,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('release') release?: string,
    @Query('file') file?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'sourcemaps:write');
    return this.sourceMaps.upload(user, { projectId, release, file }, body);
  }

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('release') release?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    requireAnyScope(user, ['sourcemaps:write', 'errors:read']);
    return this.sourceMaps.list(user, { projectId, release });
  }
}

/** Lets a CI token that can only upload also list what it uploaded. */
function requireAnyScope(user: DashboardUser, scopes: string[]) {
  if (user.authMethod !== 'pat') return;
  if (!scopes.some((scope) => user.scopes?.includes(scope))) {
    throw new ForbiddenException(`Personal access token requires "${scopes[0]}" scope.`);
  }
}
