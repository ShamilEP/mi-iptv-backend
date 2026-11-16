import { resolveSchema } from './resolve-ref.js';
import type { JsonSchema, MediaTypeObject, OpenApiDocument } from './types.js';

const MAX_DEPTH = 8;

export function pickMediaExample(
  doc: OpenApiDocument,
  media: MediaTypeObject | undefined,
): unknown {
  if (!media) {
    return undefined;
  }
  if (media.example !== undefined) {
    return media.example;
  }
  if (media.examples) {
    for (const entry of Object.values(media.examples)) {
      if (entry?.value !== undefined) {
        return entry.value;
      }
    }
  }
  if (media.schema) {
    return buildSchemaExample(doc, media.schema);
  }
  return undefined;
}

export function buildSchemaExample(
  doc: OpenApiDocument,
  schema: JsonSchema | undefined,
  depth = 0,
): unknown {
  if (!schema || depth > MAX_DEPTH) {
    return null;
  }

  const resolved = resolveSchema(doc, schema);
  if (resolved.example !== undefined) {
    return resolved.example;
  }
  if (resolved.default !== undefined) {
    return resolved.default;
  }
  if (resolved.const !== undefined) {
    return resolved.const;
  }
  if (resolved.enum && resolved.enum.length > 0) {
    return resolved.enum[0];
  }

  if (resolved.allOf && resolved.allOf.length > 0) {
    return mergeAllOfExamples(doc, resolved.allOf, depth);
  }

  const alts = resolved.oneOf ?? resolved.anyOf;
  if (alts && alts.length > 0) {
    return buildSchemaExample(doc, alts[0], depth + 1);
  }

  const typeName = primaryType(resolved.type);
  switch (typeName) {
    case 'object':
      return buildObjectExample(doc, resolved, depth);
    case 'array':
      return [buildSchemaExample(doc, resolved.items, depth + 1)];
    case 'string':
      return stringExample(resolved.format);
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      if (resolved.properties) {
        return buildObjectExample(doc, resolved, depth);
      }
      return null;
  }
}

function mergeAllOfExamples(
  doc: OpenApiDocument,
  parts: readonly JsonSchema[],
  depth: number,
): unknown {
  const merged: Record<string, unknown> = {};
  let scalar: unknown;
  for (const part of parts) {
    const value = buildSchemaExample(doc, part, depth + 1);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(merged, value);
    } else if (value !== undefined) {
      scalar = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : (scalar ?? null);
}

function buildObjectExample(
  doc: OpenApiDocument,
  schema: JsonSchema,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (!prop) continue;
    if (required.has(key) || required.size === 0) {
      out[key] = buildSchemaExample(doc, prop, depth + 1);
    }
  }
  if (Object.keys(out).length === 0 && schema.additionalProperties) {
    const additional =
      schema.additionalProperties === true
        ? { type: 'string' as const }
        : schema.additionalProperties;
    out['additionalProp1'] = buildSchemaExample(doc, additional, depth + 1);
  }
  return out;
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

function stringExample(format: string | undefined): string {
  switch (format) {
    case 'uuid':
      return '00000000-0000-4000-8000-000000000001';
    case 'email':
      return 'user@example.com';
    case 'uri':
    case 'url':
      return 'https://example.com/resource';
    case 'date-time':
      return '2026-01-01T00:00:00.000Z';
    case 'date':
      return '2026-01-01';
    case 'byte':
      return '';
    case 'password':
      return '********';
    default:
      return 'string';
  }
}
