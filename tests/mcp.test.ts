import { describe, expect, it } from 'vitest';
import { createSeraMcpTransport } from '../src/mcp';
import type { AppContext } from '../src/config';

describe('Veridex MCP transport wrapper', () => {
  it('exposes all Sera tools through the Veridex MCP transport abstraction', () => {
    const transport = createSeraMcpTransport(createMinimalContext());
    const definitions = transport.getToolDefinitions();

    expect(definitions).toHaveLength(32);
    expect(definitions[0]).toMatchObject({ name: 'sera.list_currencies' });
    expect(definitions.at(-1)).toMatchObject({ name: 'sera.doctor' });
  });
});

function createMinimalContext(): AppContext {
  return {
    cfg: {
      network: 'mainnet',
      baseUrl: 'https://api.sera.cx/api/v1',
      signerMode: 'external',
    },
    sera: {},
    signer: { mode: 'external' },
    policy: { config: { allowedSymbols: [] } },
  } as unknown as AppContext;
}
