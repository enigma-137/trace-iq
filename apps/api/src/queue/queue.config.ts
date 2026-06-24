export interface QueueConfig {
  redisUrl: string;
  defaultQueueName: string;
}

export const queueConfig: QueueConfig = {
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  defaultQueueName: 'traceiq-events'
};
