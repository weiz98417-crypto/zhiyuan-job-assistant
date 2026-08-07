import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;

export async function getSecurityRedisClient(): Promise<RedisClientType> {
  if (redisClient?.isReady) return redisClient;
  if (connecting) return connecting;

  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error('REDIS_URL is required for authentication security');

  const client = createClient({ url });
  client.on('error', (error) => {
    console.error('[security/redis]', error instanceof Error ? error.message : error);
  });
  connecting = client.connect().then(() => {
    redisClient = client as RedisClientType;
    return redisClient;
  }).finally(() => {
    connecting = null;
  });
  return connecting;
}

export async function closeSecurityRedisClient(): Promise<void> {
  if (redisClient?.isOpen) await redisClient.quit();
  redisClient = null;
  connecting = null;
}
