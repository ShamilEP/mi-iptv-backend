import { randomUUID } from 'node:crypto';
import {
  normalizeAccountEmail,
  type Account,
} from '../../domain/auth/account.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RefreshTokenRepository } from '../ports/refresh-token-repository.js';
import { IssueAuthTokenPair } from './issue-auth-token-pair.js';

/** Fixed Argon2id PHC used only to equalize timing when the email is unknown. */
export const LOGIN_DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export type LoginAccountInput = {
  readonly email: string;
  readonly password: string;
  /** Session / refresh binding (BE-023 / Security §2.2). */
  readonly deviceId: string;
};

export type LoginAccountResult = {
  readonly accountId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
};

/**
 * POST /auth/login — email/password auth with device-bound session (BE-022).
 * Wrong email and wrong password return the same AUTH_INVALID error.
 */
export class LoginAccount {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly issueAuthTokenPair: IssueAuthTokenPair,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: LoginAccountInput): Promise<LoginAccountResult> {
    const email = normalizeAccountEmail(input.email);
    const password = input.password;
    const deviceId = input.deviceId.trim();

    if (email === '' || password === '' || deviceId === '') {
      throw new DomainError(
        'email, password, and deviceId are required',
        'AUTH_INPUT_INVALID',
      );
    }

    const account = await this.accounts.findByEmail(email);
    const passwordHash = account?.passwordHash ?? LOGIN_DUMMY_PASSWORD_HASH;
    const passwordOk = await this.passwordHasher.verify(password, passwordHash);

    if (account === null || !passwordOk) {
      throw new DomainError(
        'Invalid email or password',
        'AUTH_INVALID',
      );
    }

    if (account.status !== 'active') {
      throw new DomainError('Account is not active', 'AUTH_ACCOUNT_INACTIVE');
    }

    const pair = this.issueAuthTokenPair.execute({
      accountId: account.id,
      deviceId,
      roles: [account.role],
    });

    await this.refreshTokens.insert({
      id: randomUUID(),
      accountId: account.id,
      deviceId,
      familyId: pair.refreshFamilyId,
      tokenHash: pair.refreshTokenHash,
      issuedAt: new Date(),
      expiresAt: pair.refreshExpiresAt,
      usedAt: null,
      revokedAt: null,
      revokedReason: null,
    });

    await this.accounts.save(touchLastLogin(account));

    return {
      accountId: account.id,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
    };
  }
}

function touchLastLogin(account: Account): Account {
  const now = new Date();
  return {
    ...account,
    lastLoginAt: now,
    updatedAt: now,
  };
}
