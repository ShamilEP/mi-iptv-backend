import { resolveSchema } from './resolve-ref.js';
import type { JsonSchema, OpenApiDocument } from './types.js';

const MAX_DEPTH = 10;

export type SchemaToTsOptions = {
  readonly depth?: number;
  readonly seen?: ReadonlySet<string>;
  /** Prefix for `#/components/schemas/*` refs (e.g. `Types.`). */
  readonly refPrefix?: string;
};

/**
 * Emits a TypeScript type expression for an OpenAPI schema.
 */
export function schemaToTsType(
  doc: OpenApiDocument,
  schema: JsonSchema | undefined,
  options: SchemaToTsOptions = {},
): string {
  const depth = options.depth ?? 0;
  const seen = options.seen ?? new Set<string>();
  const refPrefix = options.refPrefix ?? '';
  if (!schema || depth > MAX_DEPTH) {
    return 'unknown';
  }

  if (schema.$ref?.startsWith('#/components/schemas/')) {
    const name = schema.$ref.slice('#/components/schemas/'.length);
    return `${refPrefix}${toSafeTypeName(name)}`;
  }

  const resolved = resolveSchema(doc, schema, seen);
  if (resolved.enum && resolved.enum.length > 0) {
    return resolved.enum.map((value) => JSON.stringify(value)).join(' | ');
  }
  if (resolved.const !== undefined) {
    return JSON.stringify(resolved.const);
  }
  if (resolved.allOf && resolved.allOf.length > 0) {
    return resolved.allOf
      .map((part) =>
        schemaToTsType(doc, part, { depth: depth + 1, seen, refPrefix }),
      )
      .join(' & ');
  }
  const alts = resolved.oneOf ?? resolved.anyOf;
  if (alts && alts.length > 0) {
    return alts
      .map((part) =>
        schemaToTsType(doc, part, { depth: depth + 1, seen, refPrefix }),
      )
      .join(' | ');
  }

  const typeName = primaryType(resolved.type);
  switch (typeName) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `ReadonlyArray<${schemaToTsType(doc, resolved.items, {
        depth: depth + 1,
        seen,
        refPrefix,
      })}>`;
    case 'object':
      return objectToTs(doc, resolved, depth, seen, refPrefix);
    default:
      if (resolved.properties) {
        return objectToTs(doc, resolved, depth, seen, refPrefix);
      }
      return 'unknown';
  }
}

export function toSafeTypeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[A-Za-z_]/.test(cleaned)) {
    return cleaned;
  }
  return `Schema_${cleaned}`;
}

function objectToTs(
  doc: OpenApiDocument,
  schema: JsonSchema,
  depth: number,
  seen: ReadonlySet<string>,
  refPrefix: string,
): string {
  const required = new Set(schema.required ?? []);
  const lines: string[] = [];
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (!prop) continue;
    const optional = required.has(key) ? '' : '?';
    const propType = schemaToTsType(doc, prop, {
      depth: depth + 1,
      seen,
      refPrefix,
    });
    lines.push(`  readonly ${JSON.stringify(key)}${optional}: ${propType};`);
  }
  if (lines.length === 0) {
    if (schema.additionalProperties === true) {
      return 'Readonly<Record<string, unknown>>';
    }
    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      const valueType = schemaToTsType(doc, schema.additionalProperties, {
        depth: depth + 1,
        seen,
        refPrefix,
      });
      return `Readonly<Record<string, ${valueType}>>`;
    }
    return 'Readonly<Record<string, never>>';
  }
  return `{\n${lines.join('\n')}\n}`;
}

function primaryType(
  type: string | readonly string[] | undefined,
): string | undefined {
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type)) {
    return type.find((entry) => entry !== 'null') ?? type[0];
  }
  return undefined;
}
