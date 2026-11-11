import type { AppEnvironment } from '../../application/ports/kms-key-resolver.js';
import { devDefaults } from './dev.js';
import { prodDefaults } from './prod.js';
import { qaDefaults } from './qa.js';
import type { EnvironmentDefaults } from './types.js';

const BY_ENV: Readonly<Record<AppEnvironment, EnvironmentDefaults>> = {
  dev: devDefaults,
  qa: qaDefaults,
  prod: prodDefaults,
};

export function getEnvironmentDefaults(
  appEnv: AppEnvironment,
): EnvironmentDefaults {
  return BY_ENV[appEnv];
}

export type { EnvironmentDefaults } from './types.js';
