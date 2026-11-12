export type RoutePathMatch = {
  readonly params: Readonly<Record<string, string>>;
};

/**
 * Matches `/api/v1/sources/{id}` style templates against a request pathname.
 */
export function matchRoutePath(
  template: string,
  pathname: string,
): RoutePathMatch | null {
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
  return { params };
}
