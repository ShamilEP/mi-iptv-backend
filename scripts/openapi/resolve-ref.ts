import type { JsonSchema, OpenApiDocument } from './types.js';

/**
 * Resolves local `#/components/schemas/...` refs. Circular refs return `{}`.
 */
export function resolveSchema(
  doc: OpenApiDocument,
  schema: JsonSchema | undefined,
  seen: ReadonlySet<string> = new Set(),
): JsonSchema {
  if (!schema) {
    return {};
  }
  if (!schema.$ref) {
    return schema;
  }

  const ref = schema.$ref;
  if (!ref.startsWith('#/components/schemas/')) {
    return {};
  }
  if (seen.has(ref)) {
    return {};
  }

  const name = ref.slice('#/components/schemas/'.length);
  const target = doc.components?.schemas?.[name];
  const nextSeen = new Set(seen);
  nextSeen.add(ref);
  return resolveSchema(doc, target, nextSeen);
}
