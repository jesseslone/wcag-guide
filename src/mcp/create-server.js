import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError as SdkMcpError,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { ApiError } from "../app/errors.js";
import { capabilities, serverInfo } from "./catalog.js";
import { McpError, SiteUaMcpAdapter } from "./adapter.js";

function createLogger(logger) {
  return (event, details) => {
    logger({
      ts: new Date().toISOString(),
      event,
      ...details
    });
  };
}

function toSdkError(error) {
  if (error instanceof McpError) {
    return new SdkMcpError(error.jsonRpcCode, error.message, {
      code: error.errorCode,
      ...(error.data ?? {})
    });
  }

  if (error instanceof ApiError) {
    return new SdkMcpError(ErrorCode.InvalidParams, error.message, {
      code: error.code
    });
  }

  return error;
}

export function createMcpServer({ service, dashboardUrl, now = () => new Date(), logger = console.error }) {
  const adapter = new SiteUaMcpAdapter({ service, now, dashboardUrl });
  const log = createLogger(logger);
  const server = new Server(serverInfo, {
    capabilities
  });

  server.setRequestHandler(ListToolsRequestSchema, async (request) =>
    adapter.listTools(request.params?.cursor)
  );

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    try {
      const payload = await adapter.callTool(toolName, request.params.arguments);
      log("tool_call", {
        tool: toolName,
        outcome: "ok"
      });
      return adapter.toolResult(toolName, payload);
    } catch (error) {
      if (error instanceof ApiError || error instanceof McpError) {
        log("tool_call", {
          tool: toolName,
          outcome: "error",
          error_code: error instanceof ApiError ? error.code : error.errorCode
        });
        return adapter.toolErrorResult(toolName, error);
      }
      throw error;
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async (request) =>
    adapter.listResources(request.params?.cursor)
  );

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) =>
    adapter.listResourceTemplates(request.params?.cursor)
  );

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      log("resource_read", {
        uri: request.params.uri,
        outcome: "requested"
      });
      return await adapter.readResource(request.params.uri);
    } catch (error) {
      throw toSdkError(error);
    }
  });

  return {
    adapter,
    server,
    async listen({ input = process.stdin, output = process.stdout } = {}) {
      const transport = new StdioServerTransport(input, output);
      await server.connect(transport);
      return transport;
    },
    close() {
      return server.close();
    }
  };
}
