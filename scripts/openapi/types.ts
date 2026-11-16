/**
 * Minimal OpenAPI 3.x shapes used by docs / mock / stub tooling (BE-004).
 * Kept intentional and small — not a full OpenAPI type system.
 */

export type JsonSchema = {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly format?: string;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly example?: unknown;
  readonly default?: unknown;
  readonly nullable?: boolean;
  readonly properties?: Readonly<Record<string, JsonSchema | undefined>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly allOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly anyOf?: readonly JsonSchema[];
  readonly additionalProperties?: boolean | JsonSchema;
};

export type MediaTypeObject = {
  readonly schema?: JsonSchema;
  readonly example?: unknown;
  readonly examples?: Readonly<
    Record<string, { readonly value?: unknown } | undefined>
  >;
};

export type ResponseObject = {
  readonly description?: string;
  readonly content?: Readonly<Record<string, MediaTypeObject | undefined>>;
};

export type ParameterObject = {
  readonly name: string;
  readonly in: 'query' | 'header' | 'path' | 'cookie';
  readonly required?: boolean;
  readonly description?: string;
  readonly schema?: JsonSchema;
};

export type OperationObject = {
  readonly operationId?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly parameters?: readonly ParameterObject[];
  readonly requestBody?: {
    readonly required?: boolean;
    readonly content?: Readonly<Record<string, MediaTypeObject | undefined>>;
  };
  readonly responses?: Readonly<Record<string, ResponseObject | undefined>>;
};

export type PathItemObject = Readonly<
  Partial<
    Record<
      'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options',
      OperationObject | undefined
    >
  >
>;

export type OpenApiDocument = {
  readonly openapi?: string;
  readonly info?: {
    readonly title?: string;
    readonly version?: string;
    readonly description?: string;
  };
  readonly paths?: Readonly<Record<string, PathItemObject | undefined>>;
  readonly components?: {
    readonly schemas?: Readonly<Record<string, JsonSchema | undefined>>;
  };
};

export const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
