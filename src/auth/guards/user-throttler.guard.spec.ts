import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard', () => {
  const originalKeys = process.env.CLIENT_API_KEYS;
  let guard: UserThrottlerGuard;

  beforeEach(() => {
    process.env.CLIENT_API_KEYS = 'web-key,android-key';
    // getTracker only reads the request, so the ThrottlerGuard deps are not needed.
    guard = Object.create(UserThrottlerGuard.prototype) as UserThrottlerGuard;
  });

  afterEach(() => {
    process.env.CLIENT_API_KEYS = originalKeys;
  });

  const track = (req: Record<string, unknown>) =>
    (
      guard as unknown as { getTracker(r: unknown): Promise<string> }
    ).getTracker(req);

  it('keys signed-in users by id regardless of headers', async () => {
    await expect(
      track({
        user: { id: 7 },
        headers: { 'x-client-key': 'web-key', 'x-forwarded-for': '1.2.3.4' },
        ip: '10.0.0.1',
      }),
    ).resolves.toBe('user:7');
  });

  it('adds the forwarded end-user IP when the client key is valid', async () => {
    const a = await track({
      headers: {
        'x-client-key': 'web-key',
        'x-forwarded-for': '1.2.3.4, 10.0.0.9',
      },
      ip: '10.0.0.1',
    });
    const b = await track({
      headers: { 'x-client-key': 'web-key', 'x-forwarded-for': '5.6.7.8' },
      ip: '10.0.0.1',
    });
    expect(a).toMatch(/^client:[0-9a-f]{16}:ip:1\.2\.3\.4$/);
    expect(b).toMatch(/^client:[0-9a-f]{16}:ip:5\.6\.7\.8$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('web-key');
  });

  it('shares one bucket per valid client key when no IP is forwarded', async () => {
    const a = await track({
      headers: { 'x-client-key': 'web-key' },
      ip: '10.0.0.1',
    });
    const b = await track({
      headers: { 'x-client-key': 'web-key' },
      ip: '10.0.0.2',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^client:[0-9a-f]{16}$/);
  });

  it('ignores X-Forwarded-For when the client key is invalid', async () => {
    const a = await track({
      headers: { 'x-client-key': 'nope', 'x-forwarded-for': '1.2.3.4' },
      ip: '10.0.0.1',
    });
    const b = await track({
      headers: { 'x-client-key': 'nope', 'x-forwarded-for': '5.6.7.8' },
      ip: '10.0.0.1',
    });
    expect(a).toBe(b);
    expect(a).not.toContain('ip:');
  });

  it('ignores X-Forwarded-For entirely without a client key', async () => {
    await expect(
      track({
        headers: { 'x-forwarded-for': '1.2.3.4' },
        ips: ['10.0.0.1'],
        ip: '10.0.0.1',
      }),
    ).resolves.toBe('10.0.0.1');
    await expect(track({ headers: {}, ip: '10.0.0.2' })).resolves.toBe(
      '10.0.0.2',
    );
  });
});
