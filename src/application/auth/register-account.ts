import { randomUUID } from 'node:crypto';
import {
  isValidAccountEmail,
  normalizeAccountEmail,
  type Account,
} from '../../domain/auth/account.js';
import {
  PasswordPolicyError,
  assertPasswordMeetsPolicy,
} from '../../domain/auth/password-policy.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { CreateDefaultProfile } from '../profiles/create-default-profile.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RefreshTokenRepository } from '../ports/refresh-token-repository.js';
import { IssueAuthTokenPair } from './issue-auth-token-pair.js';

export type RegisterAccountInput = {
  readonly email: string;
  readonly password: string;
  /** Device that owns the issued refresh session (BE-023 / Security §2.2). */
  readonly deviceId: string;
};

export type RegisterAccountResult = {
  readonly accountId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
};

/**
 * POST /auth/register — create account, seed default profile, issue tokens (BE-020).
 * Duplicate email returns AUTH_EMAIL_CONFLICT so the client can offer login (US-01).
 */
export class RegisterAccount {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly issueAuthTokenPair: IssueAuthTokenPair,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly createDefaultProfile: CreateDefaultProfile,
  ) {}

  async execute(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    const email = normalizeAccountEmail(input.email);
    const password = input.password;
    const deviceId = input.deviceId.trim();

    if (email === '' || password === '' || deviceId === '') {
      throw new DomainError(
        'email, password, and deviceId are required',
        'AUTH_INPUT_INVALID',
      );
    }

    if (!isValidAccountEmail(email)) {
      throw new DomainError('email is invalid', 'AUTH_EMAIL_INVALID');
    }

    try {
      assertPasswordMeetsPolicy(password);
    } catch (error: unknown) {
      if (error instanceof PasswordPolicyError) {
        throw error;
      }
      throw error;
    }

    const existing = await this.accounts.findByEmail(email);
    if (existing !== null) {
      throw new DomainError(
        'An account with this email already exists',
        'AUTH_EMAIL_CONFLICT',
      );
    }

    const now = new Date();
    const accountId = randomUUID();
    const passwordHash = await this.passwordHasher.hash(password);
    const account: Account = {
      id: accountId,
      email,
      passwordHash,
      role: 'user',
      status: 'active',
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.accounts.insert(account);
    } catch {
      // Concurrent duplicate email (unique constraint / in-memory race).
      throw new DomainError(
        'An account with this email already exists',
        'AUTH_EMAIL_CONFLICT',
      );
    }

    await this.createDefaultProfile.execute({ accountId });

    const pair = this.issueAuthTokenPair.execute({
      accountId,
      deviceId,
      roles: [account.role],
    });

    await this.refreshTokens.insert({
      id: randomUUID(),
      accountId,
      deviceId,
      familyId: pair.refreshFamilyId,
      tokenHash: pair.refreshTokenHash,
      issuedAt: now,
      expiresAt: pair.refreshExpiresAt,
      usedAt: null,
      revokedAt: null,
      revokedReason: null,
    });

    return {
      accountId,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
    };
  }
}
