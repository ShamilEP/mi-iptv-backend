export type AppConfig = {
  readonly nodeEnv: string;
  readonly port: number;
};

/**
 * Reads configuration from `process.env` only.
 * Agents must never open `.env*` files; local tooling may load them into the process.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const portRaw = env.PORT ?? '3000';
  const port = Number.parseInt(portRaw, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port,
  };
}
