/**
 * Public API projection for source credential fields (Security §5).
 * Passwords/tokens are never returned; callers only learn whether secrets exist.
 */
export type SourceSecretsApiView = {
  readonly credentialsConfigured: boolean;
  readonly username: null;
  readonly password: null;
  readonly token: null;
};

export function maskSourceSecretsForApi(options: {
  readonly credentialsConfigured: boolean;
}): SourceSecretsApiView {
  return {
    credentialsConfigured: options.credentialsConfigured,
    username: null,
    password: null,
    token: null,
  };
}
