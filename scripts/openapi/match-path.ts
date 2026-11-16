export type PathMatch = {
  readonly template: string;
  readonly params: Readonly<Record<string, string>>;
};

/**
 * Matches OpenAPI path templates (`/api/v1/sources/{id}`) against a pathname.
 */
export function matchOpenApiPath(
  template: string,
  pathname: string,
): PathMatch | null {
  const templateParts = template.split('/').filter((part) => part.length > 0);
  const pathParts = pathname.split('/').filter((part) => part.length > 0);
  if (templateParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < templateParts.length; i += 1) {
    const expected = templateParts[i] ?? '';
    const actual = pathParts[i] ?? '';
    if (expected.startsWith('{') && expected.endsWith('}')) {
      const name = expected.slice(1, -1);
      if (name === '' || actual === '') {
        return null;
      }
      params[name] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) {
      return null;
    }
  }
  return { template, params };
}
