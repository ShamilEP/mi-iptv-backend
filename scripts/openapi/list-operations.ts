import type {
  HttpMethod,
  OpenApiDocument,
  OperationObject,
  PathItemObject,
} from './types.js';
import { HTTP_METHODS } from './types.js';

export type ListedOperation = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
  readonly operation: OperationObject;
};

export function listOpenApiOperations(
  doc: OpenApiDocument,
): readonly ListedOperation[] {
  const out: ListedOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!item) continue;
    for (const method of HTTP_METHODS) {
      const operation = readOperation(item, method);
      if (!operation) continue;
      const operationId =
        operation.operationId ??
        `${method}${path.replace(/[{}/]/g, '_')}`;
      out.push({ method, path, operationId, operation });
    }
  }
  return out;
}

function readOperation(
  item: PathItemObject,
  method: HttpMethod,
): OperationObject | undefined {
  return item[method];
}
