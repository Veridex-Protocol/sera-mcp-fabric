import {
  createAgent,
  InMemoryCheckpointStore,
  InMemoryStore,
  type AgentDefinition,
  type AgentRuntime,
  type RuntimeOptions,
} from '@veridex/agents';
import { loadConfig, type AppContext } from './config';
import { createSeraMcpTools } from './tools';

export interface CreateSeraMcpRuntimeOptions {
  ctx?: AppContext;
  definition?: Partial<AgentDefinition>;
  runtimeOptions?: RuntimeOptions;
}

export function createSeraMcpAgentDefinition(
  options: CreateSeraMcpRuntimeOptions = {},
): AgentDefinition {
  const ctx = options.ctx ?? loadConfig();
  const tools = createSeraMcpTools(ctx);

  return {
    id: options.definition?.id ?? 'sera-mcp-veridex',
    name: options.definition?.name ?? 'Sera MCP Veridex Runtime',
    model: options.definition?.model ?? { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    instructions:
      options.definition?.instructions ??
      [
        'You are the Veridex-native execution runtime for Sera Protocol stablecoin FX.',
        'Use read-only discovery, pricing, liquidity, history, and admin tools freely when relevant.',
        'Treat quote, swap, settlement, treasury, and invoice tools as financial actions governed by policy.',
        'Never bypass signer mode, quote UUID binding, daily volume caps, dry-run mode, or recipient/symbol allowlists.',
        'For execution flows, prefer get_quote or prepare_swap, external wallet signing, then execute_swap.',
      ].join('\n'),
    tools,
    maxTurns: options.definition?.maxTurns ?? 12,
    maxTokens: options.definition?.maxTokens ?? 80_000,
    metadata: {
      ...(options.definition?.metadata ?? {}),
      veridexSeraMcp: true,
      upstream: 'sera-mcp@0.4.0',
      toolCount: tools.length,
      network: ctx.cfg.network,
      signerMode: ctx.cfg.signerMode,
    },
  };
}

export function createSeraMcpRuntime(
  options: CreateSeraMcpRuntimeOptions = {},
): AgentRuntime {
  const definition = createSeraMcpAgentDefinition(options);
  return createAgent(definition, {
    enableTracing: true,
    enableCheckpoints: true,
    checkpointStore: new InMemoryCheckpointStore(),
    memoryStore: new InMemoryStore(),
    ...(options.runtimeOptions ?? {}),
  });
}
