export type DeploymentMode = 'self_hosted' | 'cloud';
export type ReplayStorageDriver = 'filesystem' | 'supabase';
export type BachsEnvironment = 'sandbox' | 'production';

export interface BachsConfig {
  environment: BachsEnvironment;
  apiBaseUrl: 'https://sandbox-api.bachs.io' | 'https://api.bachs.io';
  apiKey: string;
  webhookSecret: string;
  products: {
    proMonthly: string;
    proYearly: string;
  };
}

export interface AppConfig {
  environment: string;
  port: number;
  deploymentMode: DeploymentMode;
  replayStorageDriver: ReplayStorageDriver;
  bachs: BachsConfig | null;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const deploymentMode = parseDeploymentMode(env.TRACEIQ_DEPLOYMENT_MODE);

  return {
    environment: env.NODE_ENV ?? 'development',
    port: parsePort(env.API_PORT),
    deploymentMode,
    replayStorageDriver: parseReplayStorageDriver(env.REPLAY_STORAGE_DRIVER, deploymentMode),
    bachs: deploymentMode === 'cloud' ? parseBachsConfig(env) : null
  };
}

export function parseReplayStorageDriver(
  value: string | undefined,
  deploymentMode: DeploymentMode
): ReplayStorageDriver {
  const normalized = value?.trim().toLowerCase()
    || (deploymentMode === 'cloud' ? 'supabase' : 'filesystem');
  if (normalized !== 'filesystem' && normalized !== 'supabase') {
    throw new Error('REPLAY_STORAGE_DRIVER must be either "filesystem" or "supabase".');
  }
  return normalized;
}

function parseDeploymentMode(value: string | undefined): DeploymentMode {
  const normalized = value?.trim().toLowerCase() || 'self_hosted';
  if (normalized !== 'self_hosted' && normalized !== 'cloud') {
    throw new Error('TRACEIQ_DEPLOYMENT_MODE must be either "self_hosted" or "cloud".');
  }
  return normalized;
}

function parsePort(value: string | undefined) {
  const port = Number(value ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseBachsConfig(env: NodeJS.ProcessEnv): BachsConfig {
  const apiBaseUrl = required(env, 'BACHS_API_BASE_URL');
  if (apiBaseUrl !== 'https://sandbox-api.bachs.io' && apiBaseUrl !== 'https://api.bachs.io') {
    throw new Error('BACHS_API_BASE_URL must be https://sandbox-api.bachs.io or https://api.bachs.io.');
  }

  const environment: BachsEnvironment = apiBaseUrl.includes('sandbox-api') ? 'sandbox' : 'production';
  const apiKey = required(env, 'BACHS_API_KEY');
  const expectedPrefix = environment === 'sandbox' ? 'sk_sandbox_' : 'sk_live_';
  if (!apiKey.startsWith(expectedPrefix)) {
    throw new Error(`BACHS_API_KEY must use the ${expectedPrefix} prefix for the configured Bachs environment.`);
  }

  return {
    environment,
    apiBaseUrl,
    apiKey,
    webhookSecret: required(env, 'BACHS_WEBHOOK_SECRET'),
    products: {
      proMonthly: requiredProductId(env, 'BACHS_PRO_MONTHLY_PRODUCT_ID'),
      proYearly: requiredProductId(env, 'BACHS_PRO_YEARLY_PRODUCT_ID')
    }
  };
}

function required(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required when TRACEIQ_DEPLOYMENT_MODE=cloud.`);
  }
  return value;
}

function requiredProductId(env: NodeJS.ProcessEnv, key: string) {
  const value = required(env, key);
  if (!value.startsWith('prod_')) {
    throw new Error(`${key} must be a Bachs product ID beginning with "prod_".`);
  }
  return value;
}

export const appConfig = loadAppConfig();
