import { UserThrottlerGuard } from '../user-throttler.guard';

/** Exposes the protected tracker for unit testing. */
class TestGuard extends UserThrottlerGuard {
  tracker(req: Record<string, any>) {
    return this.getTracker(req);
  }
}

describe('UserThrottlerGuard.getTracker', () => {
  // ThrottlerGuard's constructor dependencies are not touched by getTracker.
  const guard = new TestGuard({} as any, {} as any, {} as any);

  it('keys on the user id when authenticated', async () => {
    await expect(
      guard.tracker({
        user: { id: 42 },
        headers: { 'x-client-key': 'k' },
        ip: '1.1.1.1',
      }),
    ).resolves.toBe('user:42');
  });

  it('keys on a hash of the client key for anonymous client-key calls', async () => {
    const a = await guard.tracker({
      headers: { 'x-client-key': 'key-one' },
      ip: '1.1.1.1',
    });
    const b = await guard.tracker({
      headers: { 'x-client-key': 'key-one' },
      ip: '2.2.2.2',
    });
    const c = await guard.tracker({
      headers: { 'x-client-key': 'key-two' },
      ip: '1.1.1.1',
    });

    expect(a).toMatch(/^client:[0-9a-f]{16}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('key-one');
  });

  it('falls back to the first forwarded ip, then req.ip', async () => {
    await expect(
      guard.tracker({
        headers: {},
        ips: ['9.9.9.9', '8.8.8.8'],
        ip: '1.1.1.1',
      }),
    ).resolves.toBe('9.9.9.9');
    await expect(
      guard.tracker({ headers: {}, ips: [], ip: '1.1.1.1' }),
    ).resolves.toBe('1.1.1.1');
    await expect(
      guard.tracker({ headers: { 'x-client-key': '' }, ip: '1.1.1.1' }),
    ).resolves.toBe('1.1.1.1');
  });
});
