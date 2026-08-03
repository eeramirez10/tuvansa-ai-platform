import IORedis from "ioredis";

export function createProducerRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
}

export function createWorkerRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
