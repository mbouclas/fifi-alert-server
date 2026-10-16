/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */

// In-memory stand-in for ioredis exposing only what the store uses.
const redisInstances: FakeRedis[] = [];
class FakeRedis {
  public readonly store = new Map<string, { value: string; ex: number }>();
  public readonly options: any;
  public quit = jest.fn().mockResolvedValue('OK');
  constructor(options: any) {
    this.options = options;
    redisInstances.push(this);
  }
  on() {
    return this;
  }
  set(key: string, value: string, mode: string, ex: number) {
    this.store.set(key, { value, ex });
    expect(mode).toBe('EX');
    return Promise.resolve('OK');
  }
  getdel(key: string) {
    const hit = this.store.get(key);
    this.store.delete(key);
    return Promise.resolve(hit ? hit.value : null);
  }
}
jest.mock('ioredis', () => ({ __esModule: true, default: FakeRedis }));

import {
  PASSKEY_CHALLENGE_KEY_PREFIX,
  PASSKEY_CHALLENGE_TTL_SECONDS,
  PasskeyChallengeStore,
} from '../passkey-challenge.store';

function buildConfig(values: Record<string, unknown> = {}) {
  return {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  };
}

describe('PasskeyChallengeStore', () => {
  beforeEach(() => redisInstances.splice(0));

  it('connects with the shared Redis settings AND honours REDIS_DB', () => {
    new PasskeyChallengeStore(
      buildConfig({
        REDIS_HOST: 'redis.local',
        REDIS_PORT: '6382',
        REDIS_PASSWORD: 'pw',
        REDIS_DB: '3',
      }) as any,
    );
    expect(redisInstances[0].options).toMatchObject({
      host: 'redis.local',
      port: 6382,
      password: 'pw',
      db: 3,
    });
  });

  it('stores entries under the passkey prefix with a 5 minute TTL and an opaque c_ id', async () => {
    const store = new PasskeyChallengeStore(buildConfig() as any);
    const id = await store.create({
      challenge: 'abc',
      type: 'register',
      userId: 7,
    });
    expect(id).toMatch(/^c_[A-Za-z0-9_-]{20,}$/);
    const redis = redisInstances[0];
    const entry = redis.store.get(PASSKEY_CHALLENGE_KEY_PREFIX + id)!;
    expect(entry.ex).toBe(PASSKEY_CHALLENGE_TTL_SECONDS);
    expect(PASSKEY_CHALLENGE_TTL_SECONDS).toBe(300);
    expect(JSON.parse(entry.value)).toEqual({
      challenge: 'abc',
      type: 'register',
      userId: 7,
    });
  });

  it('issues a different id per challenge', async () => {
    const store = new PasskeyChallengeStore(buildConfig() as any);
    const a = await store.create({ challenge: 'x', type: 'login' });
    const b = await store.create({ challenge: 'x', type: 'login' });
    expect(a).not.toBe(b);
  });

  it('consume is single-use: the first read returns the entry, the second returns null', async () => {
    const store = new PasskeyChallengeStore(buildConfig() as any);
    const id = await store.create({ challenge: 'once', type: 'login' });
    await expect(store.consume(id)).resolves.toEqual({
      challenge: 'once',
      type: 'login',
    });
    await expect(store.consume(id)).resolves.toBeNull();
  });

  it('consume returns null for unknown, empty or non-string ids', async () => {
    const store = new PasskeyChallengeStore(buildConfig() as any);
    await expect(store.consume('c_nope')).resolves.toBeNull();
    await expect(store.consume('')).resolves.toBeNull();
    await expect(store.consume(undefined as any)).resolves.toBeNull();
  });

  it('consume discards malformed JSON instead of throwing', async () => {
    const store = new PasskeyChallengeStore(buildConfig() as any);
    redisInstances[0].store.set(PASSKEY_CHALLENGE_KEY_PREFIX + 'c_bad', {
      value: '{not json',
      ex: 300,
    });
    await expect(store.consume('c_bad')).resolves.toBeNull();
  });

  it('closes the connection on module destroy', async () => {
    const store = new PasskeyChallengeStore(buildConfig() as any);
    await store.onModuleDestroy();
    expect(redisInstances[0].quit).toHaveBeenCalled();
  });
});
