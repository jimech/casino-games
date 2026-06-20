import { describe, expect, it } from 'vitest';
import { MemoryAuthService } from '../authService';
import { CasinoService } from '../casinoService';

describe('auth service', () => {
  it('registers a private account, creates a wallet, and restores the session', async () => {
    const casinoService = new CasinoService({});
    const authService = new MemoryAuthService(casinoService);

    const session = await authService.register({
      username: 'private_player',
      email: 'private@example.com',
      password: 'very-secret-pass',
      displayName: 'Private Player',
      acceptAgeGate: true,
      acceptTerms: true,
      acceptPrivacy: true
    });

    expect(session.token).toHaveLength(43);
    expect(session.user.username).toBe('private_player');
    expect(casinoService.getWallet(session.user.id).available).toBe(100000);

    const restored = await authService.getSession(session.token);
    expect(restored.user.id).toBe(session.user.id);
  });

  it('requires age gate, terms, and privacy consent for registration', async () => {
    const authService = new MemoryAuthService(new CasinoService({}));

    await expect(authService.register({
      username: 'too_fast',
      password: 'very-secret-pass',
      acceptAgeGate: true,
      acceptTerms: false,
      acceptPrivacy: true
    })).rejects.toThrow(/consent|required/i);
  });

  it('rejects invalid passwords and accepts valid login credentials', async () => {
    const authService = new MemoryAuthService(new CasinoService({}));

    await authService.register({
      username: 'login_player',
      email: 'login@example.com',
      password: 'very-secret-pass',
      acceptAgeGate: true,
      acceptTerms: true,
      acceptPrivacy: true
    });

    await expect(authService.login({
      login: 'login@example.com',
      password: 'wrong-password'
    })).rejects.toThrow(/invalid login/i);

    const session = await authService.login({
      login: 'LOGIN@example.com',
      password: 'very-secret-pass'
    });
    expect(session.user.username).toBe('login_player');
    await expect(authService.verifyPassword({ userId: session.user.id, password: 'very-secret-pass' })).resolves.toBe(true);
    await expect(authService.verifyPassword({ userId: session.user.id, password: 'wrong-password' })).resolves.toBe(false);
  });

  it('revokes a session on logout', async () => {
    const authService = new MemoryAuthService(new CasinoService({}));
    const session = await authService.register({
      username: 'logout_player',
      password: 'very-secret-pass',
      acceptAgeGate: true,
      acceptTerms: true,
      acceptPrivacy: true
    });

    await authService.logout(session.token);

    await expect(authService.getSession(session.token)).rejects.toThrow(/unauthorized/i);
  });

  it('assigns admin role only when the invite code matches configuration', async () => {
    const previousCode = process.env.ADMIN_INVITE_CODE;
    process.env.ADMIN_INVITE_CODE = 'private-admin-code';
    const authService = new MemoryAuthService(new CasinoService({}));

    const userSession = await authService.register({
      username: 'regular_player',
      password: 'very-secret-pass',
      adminInviteCode: 'wrong-code',
      acceptAgeGate: true,
      acceptTerms: true,
      acceptPrivacy: true
    });
    const adminSession = await authService.register({
      username: 'admin_player',
      password: 'very-secret-pass',
      adminInviteCode: 'private-admin-code',
      acceptAgeGate: true,
      acceptTerms: true,
      acceptPrivacy: true
    });

    expect(userSession.user.role).toBe('user');
    expect(adminSession.user.role).toBe('admin');
    if (previousCode === undefined) {
      delete process.env.ADMIN_INVITE_CODE;
    } else {
      process.env.ADMIN_INVITE_CODE = previousCode;
    }
  });

  it('searches public account records for admin review', async () => {
    const previousCode = process.env.ADMIN_INVITE_CODE;
    process.env.ADMIN_INVITE_CODE = 'private-admin-code';
    const authService = new MemoryAuthService(new CasinoService({}));

    const userSession = await authService.register({
      username: 'roulette_review',
      email: 'review@example.com',
      password: 'very-secret-pass',
      displayName: 'Roulette Review',
      acceptAgeGate: true,
      acceptTerms: true,
      acceptPrivacy: true
    });
    await authService.register({
      username: 'review_admin',
      password: 'very-secret-pass',
      adminInviteCode: 'private-admin-code',
      acceptAgeGate: true,
      acceptTerms: true,
      acceptPrivacy: true
    });

    const matchingUsers = await authService.searchUsers({ query: 'roulette', limit: 10 });
    expect(matchingUsers).toHaveLength(1);
    expect(matchingUsers[0]).toMatchObject({
      id: userSession.user.id,
      username: 'roulette_review',
      role: 'user'
    });
    expect(matchingUsers[0]).not.toHaveProperty('passwordHash');

    const admins = await authService.searchUsers({ role: 'admin', limit: 10 });
    expect(admins).toHaveLength(1);
    expect(admins[0].username).toBe('review_admin');

    const loaded = await authService.getUserById({ userId: userSession.user.id });
    expect(loaded?.email).toBe('review@example.com');
    await expect(authService.getUserById({ userId: 'missing-user' })).resolves.toBeUndefined();

    if (previousCode === undefined) {
      delete process.env.ADMIN_INVITE_CODE;
    } else {
      process.env.ADMIN_INVITE_CODE = previousCode;
    }
  });
});
