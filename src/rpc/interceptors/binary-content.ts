import { Code } from '@connectrpc/connect';

/**
 * Binary Connect content type accepted by the Agent Worker foundation.
 */
export const agentBinaryConnectContentType = 'application/proto';

/**
 * Rejection produced before a request reaches domain handling.
 */
export interface BinaryConnectRequestRejection {
  readonly code: Code;
  readonly message: string;
}

/**
 * Return a fail-closed rejection for requests outside the binary Connect profile.
 */
export function getBinaryConnectRequestRejection(
  request: Request
): BinaryConnectRequestRejection | undefined {
  if (request.method !== 'POST') {
    return {
      code: Code.Unimplemented,
      message: 'Agent RPC requires unary POST requests.',
    };
  }

  const rawContentType = request.headers.get('Content-Type');
  if (rawContentType === null || rawContentType.trim() === '') {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC requires Content-Type: application/proto.',
    };
  }

  const [mediaType = ''] = rawContentType.split(';', 1);
  const contentType = mediaType.trim().toLowerCase();
  if (contentType === 'application/json' || contentType === 'application/connect+json') {
    return {
      code: Code.Unimplemented,
      message: 'Agent RPC does not support Connect JSON encoding.',
    };
  }

  if (contentType !== agentBinaryConnectContentType) {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC only accepts Content-Type: application/proto.',
    };
  }

  return undefined;
}

/**
 * Return a rejection when request bytes are not valid protobuf wire data.
 */
export function getMalformedProtobufRequestRejection(
  bytes: Uint8Array
): BinaryConnectRequestRejection | undefined {
  if (isValidProtobufWireFormat(bytes)) {
    return undefined;
  }
  return {
    code: Code.InvalidArgument,
    message: 'Agent RPC received malformed Protobuf bytes.',
  };
}

interface VarintReadResult {
  readonly offset: number;
  readonly value: number;
}

function isValidProtobufWireFormat(bytes: Uint8Array): boolean {
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (key === undefined) return false;
    if (key.value === 0) return false;
    offset = key.offset;

    const wireType = key.value % 8;
    if (wireType === 0) {
      const value = readVarint(bytes, offset);
      if (value === undefined) return false;
      offset = value.offset;
      continue;
    }
    if (wireType === 1) {
      offset += 8;
    } else if (wireType === 2) {
      const length = readVarint(bytes, offset);
      if (length === undefined) return false;
      offset = length.offset + length.value;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      return false;
    }

    if (offset > bytes.length) {
      return false;
    }
  }
  return true;
}

function readVarint(bytes: Uint8Array, startOffset: number): VarintReadResult | undefined {
  let value = 0;
  let multiplier = 1;
  let offset = startOffset;

  for (let i = 0; i < 10; i += 1) {
    const byte = bytes.at(offset);
    if (byte === undefined) return undefined;
    value += (byte & 0x7f) * multiplier;
    offset += 1;
    if ((byte & 0x80) === 0) {
      return Number.isSafeInteger(value) ? { offset, value } : undefined;
    }
    multiplier *= 128;
  }

  return undefined;
}
