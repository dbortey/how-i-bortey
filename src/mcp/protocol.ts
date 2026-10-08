export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_UNAUTHORIZED = -32001;

export const DEFAULT_PROTOCOL = "2025-06-18";

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): JsonRpcError {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
