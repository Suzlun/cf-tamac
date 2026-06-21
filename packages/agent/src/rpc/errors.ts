import { Code } from '@connectrpc/connect';
import { codeToHttpStatus, codeToString } from '@connectrpc/connect/protocol-connect';

/**
 * Create a Connect-compatible unary error response.
 */
export function createConnectErrorResponse(code: Code, message: string): Response {
  return new Response(
    JSON.stringify({
      code: codeToString(code),
      message,
    }),
    {
      status: codeToHttpStatus(code),
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
      },
    }
  );
}

/**
 * Create a fail-closed Connect unimplemented response.
 */
export function createUnimplementedResponse(message: string): Response {
  return createConnectErrorResponse(Code.Unimplemented, message);
}

/**
 * Create a fail-closed Connect invalid-argument response.
 */
export function createInvalidArgumentResponse(message: string): Response {
  return createConnectErrorResponse(Code.InvalidArgument, message);
}
