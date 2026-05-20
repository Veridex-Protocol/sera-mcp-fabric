#!/usr/bin/env node
import { loadConfig } from '../config';
import { SERA_MCP_TOOL_NAMES, getSeraMcpToolSpec } from '../tools';
import { startSeraMcpStdio } from '../mcp/stdio';

const HELP = `sera-mcp-fabric

Usage:
  sera-mcp-fabric tools              List Veridex-wrapped sera.* tools
  sera-mcp-fabric doctor             Run sera.doctor through the wrapped handler
  sera-mcp-fabric mcp                Start MCP stdio server
  sera-mcp-fabric help               Show this help
`;

async function main(argv: string[]): Promise<void> {
  const command = argv[0] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return;
  }

  if (command === 'tools') {
    process.stdout.write(JSON.stringify({ count: SERA_MCP_TOOL_NAMES.length, tools: SERA_MCP_TOOL_NAMES }, null, 2) + '\n');
    return;
  }

  if (command === 'mcp') {
    await startSeraMcpStdio();
    return;
  }

  if (command === 'doctor') {
    const spec = getSeraMcpToolSpec('sera.doctor');
    if (!spec) throw new Error('sera.doctor not registered');
    const result = await spec.handler(loadConfig(), {});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1]?.includes('/cli/')) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exit(1);
  });
}
