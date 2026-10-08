import { Hono } from "hono";
import { resolveBearer } from "./auth";
import { callTool, TOOLS } from "./tools";
import {
  DEFAULT_PROTOCOL,
  RPC_INVALID_PARAMS,
  RPC_METHOD_NOT_FOUND,
  RPC_PARSE_ERROR,
  RPC_UNAUTHORIZED,
  rpcError,
} from "./protocol";

export const mcpRoutes = new Hono<{ Bindings: Env }>();

mcpRoutes.get("/", (c) => c.body(null, 405, { Allow: "POST" }));

mcpRoutes.post("/", async (c) => {
  const auth = await resolveBearer(c.env.DB, c.req.raw);
  if (!auth) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json(rpcError(null, RPC_UNAUTHORIZED, "unauthorized"), 401);
  }

  let body: { id?: unknown; method?: unknown; params?: unknown } | null = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, RPC_PARSE_ERROR, "parse error"), 400);
  }

  const id = (body?.id ?? null) as string | number | null;
  const method = typeof body?.method === "string" ? body.method : "";
  const params = (
    body?.params && typeof body.params === "object" ? body.params : {}
  ) as Record<string, unknown>;

  if (method.startsWith("notifications/")) return c.body(null, 202);

  if (method === "initialize") {
    const requested =
      typeof params.protocolVersion === "string" && params.protocolVersion
        ? params.protocolVersion
        : DEFAULT_PROTOCOL;
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: requested,
        capabilities: { tools: {} },
        serverInfo: { name: "how-i-bortey", version: "0.1.0" },
      },
    });
  }

  if (method === "ping") return c.json({ jsonrpc: "2.0", id, result: {} });

  if (method === "tools/list") {
    return c.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    if (!name) return c.json(rpcError(id, RPC_INVALID_PARAMS, "invalid params: name is required"), 200);
    const args =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};
    const result = await callTool(c.env.DB, name, args);
    return c.json({ jsonrpc: "2.0", id, result });
  }

  return c.json(rpcError(id, RPC_METHOD_NOT_FOUND, "method not found"), 200);
});
