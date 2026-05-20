#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, type AppContext } from '../config';
import { SERA_MCP_TOOL_SPECS } from '../tools';
import { listResources, readResource } from '../upstream/resources';
import { listPrompts, getPrompt } from '../upstream/prompts';
import { zodToJsonSchema } from '../upstream/util/zod-to-json';
import { log } from '../upstream/util/logger';

export function createSeraMcpStdioServer(ctx: AppContext = loadConfig()): Server {
  const server = new Server(
    { name: 'sera-mcp-veridex', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: SERA_MCP_TOOL_SPECS.map((spec) => ({
      name: spec.name,
      description: spec.description,
      inputSchema: zodToJsonSchema(spec.schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const spec = SERA_MCP_TOOL_SPECS.find((candidate) => candidate.name === request.params.name);
    if (!spec) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      };
    }

    try {
      const startedAt = Date.now();
      const result = await spec.handler(ctx, request.params.arguments ?? {});
      log.debug('veridex tool ok', { tool: spec.name, ms: Date.now() - startedAt });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('veridex tool error', { tool: spec.name, error: message });
      return {
        isError: true,
        content: [{ type: 'text', text: `Error in ${spec.name}: ${message}` }],
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = await readResource(ctx, request.params.uri);
    return { contents: [resource] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listPrompts(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) =>
    getPrompt(request.params.name, (request.params.arguments ?? {}) as Record<string, string>),
  );

  return server;
}

export async function startSeraMcpStdio(ctx: AppContext = loadConfig()): Promise<void> {
  const server = createSeraMcpStdioServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  try {
    const config = await ctx.sera.getConfig();
    const chainId = Number(config.chain_id);
    const expectedChainId = ctx.cfg.network === 'mainnet' ? 1 : 11155111;
    if (Number.isFinite(chainId) && chainId !== expectedChainId) {
      log.warn('network label mismatch', {
        SERA_NETWORK: ctx.cfg.network,
        chain_id: chainId,
        expected: expectedChainId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('config probe failed', { error: message });
  }

  log.info('sera-mcp-veridex ready', {
    version: '0.1.0',
    network: ctx.cfg.network,
    base_url: ctx.cfg.baseUrl,
    signer: ctx.cfg.signerMode,
    tools: SERA_MCP_TOOL_SPECS.length,
    history: process.env.SERA_HISTORY_DB ? 'enabled' : 'disabled',
  });
}

if (process.argv[1]?.includes('/mcp/stdio')) {
  startSeraMcpStdio().catch((error) => {
    log.error('fatal', { error: error instanceof Error ? error.stack ?? error.message : String(error) });
    process.exit(1);
  });
}
