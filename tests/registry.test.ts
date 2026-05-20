import { describe, expect, it } from 'vitest';
import {
  SERA_MCP_TOOL_NAMES,
  SERA_MCP_TOOL_SPECS,
  createSeraMcpTools,
  getSeraMcpToolSpec,
} from '../src/tools';
import type { AppContext } from '../src/config';

const EXPECTED_TOOL_NAMES = [
  'sera.list_currencies',
  'sera.get_markets',
  'sera.get_fx_rate',
  'sera.compare_to_external_fx',
  'sera.spread_radar',
  'sera.scan_markets',
  'sera.find_deals',
  'sera.maker_quote_ladder',
  'sera.multi_source_mid',
  'sera.probe_depth',
  'sera.round_trip_cost',
  'sera.infer_book',
  'sera.market_health',
  'sera.fx_quote_diff',
  'sera.compare_corridors',
  'sera.get_quote',
  'sera.prepare_swap',
  'sera.execute_swap',
  'sera.convert_and_send',
  'sera.quote_recipient_amount',
  'sera.find_cheapest_settlement_path',
  'sera.limit_watcher',
  'sera.settlement_status',
  'sera.get_balances',
  'sera.treasury_value',
  'sera.exposure_report',
  'sera.rebalance_plan',
  'sera.pay_invoice',
  'sera.fx_history',
  'sera.fx_volatility',
  'sera.corridor_pnl',
  'sera.doctor',
];

describe('sera-mcp tool registry', () => {
  it('preserves the upstream 32-tool MCP surface in order', () => {
    expect(SERA_MCP_TOOL_NAMES).toEqual(EXPECTED_TOOL_NAMES);
    expect(new Set(SERA_MCP_TOOL_NAMES).size).toBe(32);
  });

  it('assigns safety classes to execution-sensitive tools', () => {
    expect(getSeraMcpToolSpec('sera.get_fx_rate')?.safetyClass).toBe('network');
    expect(getSeraMcpToolSpec('sera.get_quote')?.safetyClass).toBe('financial');
    expect(getSeraMcpToolSpec('sera.execute_swap')?.safetyClass).toBe('financial');
    expect(getSeraMcpToolSpec('sera.fx_history')?.safetyClass).toBe('read');
  });

  it('creates Veridex ToolContracts with exact MCP names', () => {
    const tools = createSeraMcpTools(createMockContext());
    expect(tools.map((contract) => contract.name)).toEqual(EXPECTED_TOOL_NAMES);
    expect(tools.every((contract) => contract.metadata?.source === 'sera-mcp')).toBe(true);
  });

  it('executes a wrapped read tool through the Veridex ToolContract', async () => {
    const tools = createSeraMcpTools(createMockContext());
    const listCurrencies = tools.find((contract) => contract.name === 'sera.list_currencies');
    expect(listCurrencies).toBeDefined();

    const result = await listCurrencies!.execute({
      input: { fiat: 'USD' },
      context: { runId: 'test-run', agentId: 'test-agent', turnIndex: 0 },
    });

    expect(result.success).toBe(true);
    expect(JSON.parse(result.llmOutput)).toMatchObject({ count: 1 });
  });

  it('keeps every spec backed by a schema and handler', () => {
    for (const spec of SERA_MCP_TOOL_SPECS) {
      expect(spec.schema).toBeDefined();
      expect(spec.handler).toBeTypeOf('function');
      expect(spec.description.length).toBeGreaterThan(40);
    }
  });
});

function createMockContext(): AppContext {
  return {
    cfg: {
      network: 'mainnet',
      baseUrl: 'https://api.sera.cx/api/v1',
      signerMode: 'external',
    },
    sera: {
      getTokens: async () => ({
        tokens: [
          {
            symbol: 'USDC',
            fiat_currency: 'USD',
            address: '0x0000000000000000000000000000000000000001',
            decimals: 6,
          },
          {
            symbol: 'XSGD',
            fiat_currency: 'SGD',
            address: '0x0000000000000000000000000000000000000002',
            decimals: 6,
          },
        ],
      }),
    },
    signer: { mode: 'external' },
    policy: {
      config: {
        allowedSymbols: ['USDC'],
      },
    },
  } as unknown as AppContext;
}
