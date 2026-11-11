export type AppEnvironment = 'dev' | 'qa' | 'prod';

/**
 * Resolves the environment-scoped KMS key id/ARN used to protect secrets
 * and source-credential envelope keys (Security §5).
 */
export interface KmsKeyResolver {
  resolveKeyId(environment: AppEnvironment): string;
}
