import { describe, expect, it } from 'vitest';

import { getOpenApiDocument } from '@cfreact-template-backend/http';

import contractOpenApi from '../../../../typespec/openapi/openapi.json';

interface OpenApiOperation {
  operationId?: string;
  responses?: Record<string, unknown>;
  requestBody?: unknown;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

const toDoc = (value: unknown): OpenApiDocument => value as OpenApiDocument;

const normalizeMethods = (
  pathItem: Record<string, OpenApiOperation>
): Map<string, OpenApiOperation> => {
  const out = new Map<string, OpenApiOperation>();
  for (const [method, operation] of Object.entries(pathItem)) {
    out.set(method.toLowerCase(), operation);
  }
  return out;
};

const getOperationsIndex = (doc: OpenApiDocument): Map<string, Map<string, OpenApiOperation>> => {
  const paths = doc.paths ?? {};
  const out = new Map<string, Map<string, OpenApiOperation>>();
  for (const [path, rawPathItem] of Object.entries(paths)) {
    out.set(path, normalizeMethods(rawPathItem));
  }
  return out;
};

describe('OpenAPI contract', () => {
  it('server routes match the TypeSpec OpenAPI contract (paths/methods/operationId)', () => {
    const serverDoc = toDoc(
      getOpenApiDocument({
        openapi: '3.0.3',
        info: {
          title: 'cfreact-template API',
          version: '1.0.0',
        },
        servers: [{ url: '/', description: 'Default server' }],
      })
    );
    const contractDoc = toDoc(contractOpenApi);

    const serverIndex = getOperationsIndex(serverDoc);
    const contractIndex = getOperationsIndex(contractDoc);

    expect(Array.from(serverIndex.keys()).sort()).toEqual(Array.from(contractIndex.keys()).sort());

    for (const [path, contractPathItem] of contractIndex.entries()) {
      const serverPathItem = serverIndex.get(path);
      if (serverPathItem == null) {
        throw new Error(`Missing path in server OpenAPI: ${path}`);
      }

      expect(Array.from(serverPathItem.keys()).sort()).toEqual(
        Array.from(contractPathItem.keys()).sort()
      );

      for (const [method, contractOp] of contractPathItem.entries()) {
        const serverOp = serverPathItem.get(method);
        if (serverOp == null) {
          throw new Error(`Missing operation in server OpenAPI: ${method.toUpperCase()} ${path}`);
        }
        expect(serverOp.operationId).toEqual(contractOp.operationId);

        const contractResponseCodes = Object.keys(contractOp.responses ?? {}).sort();
        const serverResponseCodes = Object.keys(serverOp.responses ?? {}).sort();
        expect(serverResponseCodes).toEqual(contractResponseCodes);

        const hasContractRequestBody = contractOp.requestBody != null;
        const hasServerRequestBody = serverOp.requestBody != null;
        expect(hasServerRequestBody).toEqual(hasContractRequestBody);
      }
    }
  });
});
