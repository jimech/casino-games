import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { CreateUserWalletInput } from './casinoService';

export interface AuthUser {
  id: string;
  email?: string;
  username: string;
  role: 'user' | 'admin';
  displayName?: string;
  dateOfBirth?: string;
  ageGateAcceptedAt?: string;
  termsAcceptedAt?: string;
  privacyAcceptedAt?: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export interface RegisterInput {
  email?: string;
  username: string;
  password: string;
  displayName?: string;
  dateOfBirth?: string;
  acceptAgeGate: boolean;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  adminInviteCode?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginInput {
  login: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface UpdateConsentInput {
  token: string;
  acceptAgeGate?: boolean;
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
}

export interface UpdateProfileInput {
  token: string;
  displayName?: string;
  email?: string;
}

export interface AuthService {
  register(input: RegisterInput): Promise<AuthSession>;
  login(input: LoginInput): Promise<AuthSession>;
  getSession(token: string): Promise<AuthSession>;
  logout(token: string): Promise<void>;
  updateConsent(input: UpdateConsentInput): Promise<AuthSession>;
  updateProfile(input: UpdateProfileInput): Promise<AuthSession>;
  searchUsers(input: { query?: string; role?: 'user' | 'admin'; limit?: number }): Promise<AuthUser[]>;
  getUserById(input: { userId: string }): Promise<AuthUser | undefined>;
  verifyPassword(input: { userId: string; password: string }): Promise<boolean>;
}

interface WalletCreator {
  createUserWallet(input: CreateUserWalletInput): Promise<unknown> | unknown;
}

type StoredUser = AuthUser & {
  passwordHash: string;
};

type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  token: string;
  expiresAt: string;
  revokedAt?: string;
  userAgent?: string;
  ipAddress?: string;
};

const SESSION_DAYS = 7;

export class MemoryAuthService implements AuthService {
  private users = new Map<string, StoredUser>();
  private usernameIndex = new Map<string, string>();
  private emailIndex = new Map<string, string>();
  private sessions = new Map<string, StoredSession>();

  constructor(private readonly walletCreator: WalletCreator) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    validateRegistration(input);
    const usernameKey = normalizeIdentity(input.username);
    const emailKey = input.email ? normalizeIdentity(input.email) : undefined;
    if (this.usernameIndex.has(usernameKey)) throw new Error('Username is already registered');
    if (emailKey && this.emailIndex.has(emailKey)) throw new Error('Email is already registered');

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: `user_${randomUUID()}`,
      email: input.email?.trim().toLowerCase(),
      username: input.username.trim(),
      role: resolveRegistrationRole(input.adminInviteCode),
      displayName: cleanOptionalText(input.displayName) ?? input.username.trim(),
      dateOfBirth: input.dateOfBirth,
      ageGateAcceptedAt: input.acceptAgeGate ? now : undefined,
      termsAcceptedAt: input.acceptTerms ? now : undefined,
      privacyAcceptedAt: input.acceptPrivacy ? now : undefined,
      createdAt: now,
      passwordHash: hashPasswordForStorage(input.password)
    };

    this.users.set(user.id, user);
    this.usernameIndex.set(usernameKey, user.id);
    if (emailKey) this.emailIndex.set(emailKey, user.id);
    await this.walletCreator.createUserWallet({ userId: user.id });
    return this.createSession(user, input);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const userId = this.usernameIndex.get(normalizeIdentity(input.login)) ?? this.emailIndex.get(normalizeIdentity(input.login));
    const user = userId ? this.users.get(userId) : undefined;
    if (!user || !verifyPassword(input.password, user.passwordHash)) throw new Error('Invalid login credentials');
    return this.createSession(user, input);
  }

  async getSession(token: string): Promise<AuthSession> {
    const session = this.requireStoredSession(token);
    const user = this.users.get(session.userId);
    if (!user) throw new Error('Invalid session');
    return { token: session.token, expiresAt: session.expiresAt, user: publicUser(user) };
  }

  async logout(token: string): Promise<void> {
    const session = this.sessions.get(hashToken(token));
    if (session) session.revokedAt = new Date().toISOString();
  }

  async updateConsent(input: UpdateConsentInput): Promise<AuthSession> {
    const session = this.requireStoredSession(input.token);
    const user = this.users.get(session.userId);
    if (!user) throw new Error('Invalid session');
    const now = new Date().toISOString();
    if (input.acceptAgeGate) user.ageGateAcceptedAt = now;
    if (input.acceptTerms) user.termsAcceptedAt = now;
    if (input.acceptPrivacy) user.privacyAcceptedAt = now;
    return { token: session.token, expiresAt: session.expiresAt, user: publicUser(user) };
  }

  async updateProfile(input: UpdateProfileInput): Promise<AuthSession> {
    const session = this.requireStoredSession(input.token);
    const user = this.users.get(session.userId);
    if (!user) throw new Error('Invalid session');
    const displayName = cleanOptionalText(input.displayName);
    if (displayName) user.displayName = displayName;
    if (input.email) {
      const email = input.email.trim().toLowerCase();
      const emailKey = normalizeIdentity(email);
      const existingUserId = this.emailIndex.get(emailKey);
      if (existingUserId && existingUserId !== user.id) throw new Error('Email is already registered');
      if (user.email) this.emailIndex.delete(normalizeIdentity(user.email));
      user.email = email;
      this.emailIndex.set(emailKey, user.id);
    }
    return { token: session.token, expiresAt: session.expiresAt, user: publicUser(user) };
  }

  async verifyPassword(input: { userId: string; password: string }): Promise<boolean> {
    const user = this.users.get(input.userId);
    return Boolean(user && verifyPassword(input.password, user.passwordHash));
  }

  async searchUsers(input: { query?: string; role?: 'user' | 'admin'; limit?: number }): Promise<AuthUser[]> {
    const query = normalizeSearchQuery(input.query);
    const limit = normalizeSearchLimit(input.limit);
    return Array.from(this.users.values())
      .filter(user => !input.role || user.role === input.role)
      .filter(user => !query || userMatchesQuery(user, query))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .slice(0, limit)
      .map(publicUser);
  }

  async getUserById(input: { userId: string }): Promise<AuthUser | undefined> {
    const user = this.users.get(input.userId);
    return user ? publicUser(user) : undefined;
  }

  private createSession(user: StoredUser, input: { userAgent?: string; ipAddress?: string }): AuthSession {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = sessionExpiry().toISOString();
    const session: StoredSession = {
      id: `session_${randomUUID()}`,
      userId: user.id,
      token,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress
    };
    this.sessions.set(session.tokenHash, session);
    return { token, expiresAt, user: publicUser(user) };
  }

  private requireStoredSession(token: string): StoredSession {
    const session = this.sessions.get(hashToken(token));
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new Error('Unauthorized session');
    }
    return session;
  }
}

export class PrismaAuthService implements AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletCreator: WalletCreator
  ) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    validateRegistration(input);
    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        email: input.email?.trim().toLowerCase(),
        username: input.username.trim(),
        passwordHash: hashPasswordForStorage(input.password),
        role: resolveRegistrationRole(input.adminInviteCode),
        displayName: cleanOptionalText(input.displayName) ?? input.username.trim(),
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        ageGateAcceptedAt: input.acceptAgeGate ? now : undefined,
        termsAcceptedAt: input.acceptTerms ? now : undefined,
        privacyAcceptedAt: input.acceptPrivacy ? now : undefined
      }
    });
    await this.walletCreator.createUserWallet({ userId: user.id });
    return this.createSession(user.id, input);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const login = normalizeIdentity(input.login);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: input.login, mode: 'insensitive' } },
          { email: { equals: login, mode: 'insensitive' } }
        ]
      }
    });
    if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      throw new Error('Invalid login credentials');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.createSession(user.id, input);
  }

  async getSession(token: string): Promise<AuthSession> {
    const session = await this.requireStoredSession(token);
    await this.prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return {
      token,
      expiresAt: session.expiresAt.toISOString(),
      user: prismaUserToAuthUser(session.user)
    };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async updateConsent(input: UpdateConsentInput): Promise<AuthSession> {
    const session = await this.requireStoredSession(input.token);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        ageGateAcceptedAt: input.acceptAgeGate ? now : undefined,
        termsAcceptedAt: input.acceptTerms ? now : undefined,
        privacyAcceptedAt: input.acceptPrivacy ? now : undefined
      }
    });
    return this.getSession(input.token);
  }

  async updateProfile(input: UpdateProfileInput): Promise<AuthSession> {
    const session = await this.requireStoredSession(input.token);
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        displayName: cleanOptionalText(input.displayName),
        email: input.email?.trim().toLowerCase()
      }
    });
    return this.getSession(input.token);
  }

  async verifyPassword(input: { userId: string; password: string }): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { passwordHash: true }
    });
    return Boolean(user?.passwordHash && verifyPassword(input.password, user.passwordHash));
  }

  async searchUsers(input: { query?: string; role?: 'user' | 'admin'; limit?: number }): Promise<AuthUser[]> {
    const query = normalizeSearchQuery(input.query);
    const users = await this.prisma.user.findMany({
      where: {
        role: input.role,
        ...(query ? {
          OR: [
            { id: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } }
          ]
        } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeSearchLimit(input.limit)
    });
    return users.map(prismaUserToAuthUser);
  }

  async getUserById(input: { userId: string }): Promise<AuthUser | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    return user ? prismaUserToAuthUser(user) : undefined;
  }

  private async createSession(userId: string, input: { userAgent?: string; ipAddress?: string }): Promise<AuthSession> {
    const token = randomBytes(32).toString('base64url');
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: sessionExpiry(),
        userAgent: input.userAgent,
        ipAddress: input.ipAddress
      },
      include: { user: true }
    });
    return {
      token,
      expiresAt: session.expiresAt.toISOString(),
      user: prismaUserToAuthUser(session.user)
    };
  }

  private async requireStoredSession(token: string) {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true }
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new Error('Unauthorized session');
    }
    return session;
  }
}

export const extractBearerToken = (authorization: string | undefined): string => {
  if (!authorization?.startsWith('Bearer ')) throw new Error('Unauthorized session');
  return authorization.slice('Bearer '.length).trim();
};

const validateRegistration = (input: RegisterInput) => {
  assertText(input.username, 'username');
  assertText(input.password, 'password');
  if (input.username.trim().length < 3) throw new Error('Username must be at least 3 characters');
  if (input.password.length < 10) throw new Error('Password must be at least 10 characters');
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error('Email is invalid');
  if (!input.acceptAgeGate || !input.acceptTerms || !input.acceptPrivacy) {
    throw new Error('Age gate, terms, and privacy consent are required');
  }
};

export const hashPasswordForStorage = (password: string): string => {
  const salt = randomBytes(16).toString('base64url');
  const iterations = 210_000;
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
};

const verifyPassword = (password: string, stored: string): boolean => {
  const [scheme, iterationsText, salt, digest] = stored.split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterationsText || !salt || !digest) return false;
  const candidate = pbkdf2Sync(password, salt, Number(iterationsText), 32, 'sha256');
  const expected = Buffer.from(digest, 'base64url');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
};

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const normalizeIdentity = (value: string): string => value.trim().toLowerCase();

const cleanOptionalText = (value: string | undefined): string | undefined => {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 80) : undefined;
};

const normalizeSearchQuery = (value: string | undefined): string | undefined => {
  const cleaned = value?.trim().toLowerCase();
  return cleaned ? cleaned.slice(0, 120) : undefined;
};

const normalizeSearchLimit = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 25;
  return Math.max(1, Math.min(100, Math.trunc(Number(value))));
};

const userMatchesQuery = (user: AuthUser, query: string): boolean => {
  return [
    user.id,
    user.username,
    user.email,
    user.displayName
  ].some(value => value?.toLowerCase().includes(query));
};

const sessionExpiry = (): Date => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  return expiresAt;
};

const publicUser = (user: StoredUser): AuthUser => ({
  id: user.id,
  email: user.email,
  username: user.username,
  role: user.role,
  displayName: user.displayName,
  dateOfBirth: user.dateOfBirth,
  ageGateAcceptedAt: user.ageGateAcceptedAt,
  termsAcceptedAt: user.termsAcceptedAt,
  privacyAcceptedAt: user.privacyAcceptedAt,
  createdAt: user.createdAt
});

const prismaUserToAuthUser = (user: {
  id: string;
  email: string | null;
  username: string;
  role: string;
  displayName: string | null;
  dateOfBirth: Date | null;
  ageGateAcceptedAt: Date | null;
  termsAcceptedAt: Date | null;
  privacyAcceptedAt: Date | null;
  createdAt: Date;
}): AuthUser => ({
  id: user.id,
  email: user.email ?? undefined,
  username: user.username,
  role: user.role === 'admin' ? 'admin' : 'user',
  displayName: user.displayName ?? undefined,
  dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10),
  ageGateAcceptedAt: user.ageGateAcceptedAt?.toISOString(),
  termsAcceptedAt: user.termsAcceptedAt?.toISOString(),
  privacyAcceptedAt: user.privacyAcceptedAt?.toISOString(),
  createdAt: user.createdAt.toISOString()
});

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') throw new Error(`${field} is required`);
};

const resolveRegistrationRole = (adminInviteCode: string | undefined): 'user' | 'admin' => {
  const configuredCode = process.env.ADMIN_INVITE_CODE;
  if (configuredCode && adminInviteCode === configuredCode) return 'admin';
  return 'user';
};
