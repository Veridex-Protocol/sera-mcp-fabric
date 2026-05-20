import { MCPServerTransport } from '@veridex/agents';
import { loadConfig, type AppContext } from '../config';
import { createSeraMcpTools } from '../tools';

export function createSeraMcpTransport(ctx: AppContext = loadConfig()): MCPServerTransport {
  const transport = new MCPServerTransport();
  transport.registerTools(createSeraMcpTools(ctx));
  return transport;
}

export { startSeraMcpStdio } from './stdio';
