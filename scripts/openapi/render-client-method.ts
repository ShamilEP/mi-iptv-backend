import { schemaToTsType } from './schema-to-ts.js';
import type {
  JsonSchema,
  OpenApiDocument,
  OperationObject,
  ParameterObject,
} from './types.js';

export function renderClientMethod(
  doc: OpenApiDocument,
  operation: OperationObject,
  meta: {
    readonly method: string;
    readonly path: string;
    readonly operationId: string;
  },
): string {
  const fnName = toCamel(meta.operationId);
  const pathParams = collectPathParams(meta.path, operation.parameters);
  const queryParams = (operation.parameters ?? []).filter(
    (param) => param.in === 'query',
  );
  const bodySchema =
    operation.requestBody?.content?.['application/json']?.schema;
  const hasBody = Boolean(bodySchema);
  const success = firstSuccessSchema(operation);
  const responseType = success
    ? schemaToTsType(doc, success, { refPrefix: 'Types.' })
    : 'void';

  const args: string[] = [];
  for (const param of pathParams) {
    args.push(`${param}: string`);
  }
  if (queryParams.length > 0) {
    const allOptional = queryParams.every((param) => !param.required);
    const queryType = renderQueryType(doc, queryParams);
    args.push(allOptional ? `query: ${queryType} = {}` : `query: ${queryType}`);
  }
  if (hasBody) {
    args.push(
      `body: ${schemaToTsType(doc, bodySchema, { refPrefix: 'Types.' })}`,
    );
  }

  const pathExpr = pathParams.reduce(
    (expr, param) =>
      expr.replace(`{${param}}`, `\${encodeURIComponent(${param})}`),
    meta.path,
  );
  const requestPath =
    queryParams.length > 0
      ? `this.buildPath(\`${pathExpr}\`, query)`
      : `\`${pathExpr}\``;

  const isPublic = isPublicOperation(meta.operationId);
  let initArg = '';
  if (hasBody && isPublic) {
    initArg = ', { body, auth: false }';
  } else if (hasBody) {
    initArg = ', { body }';
  } else if (isPublic) {
    initArg = ', { auth: false }';
  }

  return `  /** ${operation.summary ?? meta.operationId} */
  ${fnName}(${args.join(', ')}): Promise<${responseType}> {
    return this.request(${JSON.stringify(meta.method.toUpperCase())}, ${requestPath}${initArg});
  }`;
}

function collectPathParams(
  path: string,
  parameters: readonly ParameterObject[] | undefined,
): string[] {
  const fromTemplate = [...path.matchAll(/\{([^}]+)\}/g)].map(
    (m) => m[1] ?? '',
  );
  const fromSpec = (parameters ?? [])
    .filter((param) => param.in === 'path')
    .map((param) => param.name);
  const ordered = fromTemplate.length > 0 ? fromTemplate : fromSpec;
  return [...new Set(ordered.filter(Boolean))];
}

function renderQueryType(
  doc: OpenApiDocument,
  params: readonly ParameterObject[],
): string {
  const lines = params.map((param) => {
    const optional = param.required ? '' : '?';
    const type = schemaToTsType(doc, param.schema ?? { type: 'string' });
    return `  readonly ${JSON.stringify(param.name)}${optional}: ${type};`;
  });
  return `{\n${lines.join('\n')}\n}`;
}

function firstSuccessSchema(
  operation: OperationObject,
): JsonSchema | undefined {
  const responses = operation.responses ?? {};
  for (const code of ['200', '201', '202']) {
    const schema = responses[code]?.content?.['application/json']?.schema;
    if (schema) return schema;
  }
  return undefined;
}

function isPublicOperation(operationId: string): boolean {
  return (
    operationId === 'getHealth' ||
    operationId === 'register' ||
    operationId === 'login' ||
    operationId === 'refresh' ||
    operationId === 'requestPasswordReset' ||
    operationId === 'confirmPasswordReset'
  );
}

function toCamel(operationId: string): string {
  if (!operationId) return 'operation';
  return operationId.charAt(0).toLowerCase() + operationId.slice(1);
}
