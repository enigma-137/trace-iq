export interface AppConfig {
  environment: string;
  port: number;
}

export const appConfig: AppConfig = {
  environment: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 4000)
};
