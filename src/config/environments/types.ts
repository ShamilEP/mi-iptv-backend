import type { AppEnvironment } from '../../application/ports/kms-key-resolver.js';

export type EnvironmentDefaults = {
  readonly appEnv: AppEnvironment;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly defaultPort: number;
};
