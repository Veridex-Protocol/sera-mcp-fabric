import { tool, type ToolContract, type ToolResult, type ToolSafetyClass } from '@veridex/agents';
import type { z } from 'zod';
import { loadConfig, type AppContext } from '../upstream/config';
import {
  CompareCorridorsInput,
  CompareToExternalFxInput,
  ConvertAndSendInput,
  DoctorInput,
  ExecuteSwapInput,
  ExposureReportInput,
  FindCheapestPathInput,
  FindDealsInput,
  FxHistoryInput,
  FxQuoteDiffInput,
  GetBalancesInput,
  GetFxRateInput,
  GetMarketsInput,
  GetQuoteInput,
  InferBookInput,
  LimitWatcherInput,
  ListCurrenciesInput,
  MakerQuoteLadderInput,
  MarketHealthInput,
  MultiSourceMidInput,
  PayInvoiceInput,
  PrepareSwapInput,
  ProbeDepthInput,
  QuoteRecipientAmountInput,
  RebalancePlanInput,
  RoundTripCostInput,
  ScanMarketsInput,
  SettlementStatusInput,
  SpreadRadarInput,
  TreasuryValueInput,
} from '../upstream/tools/schemas';
import {
  executeSwap,
  getBalances,
  getFxRate,
  getMarkets,
  getQuote,
  listCurrencies,
  prepareSwap,
} from '../upstream/tools/core';
import {
  convertAndSend,
  findCheapestPath,
  quoteRecipientAmount,
} from '../upstream/tools/semantic';
import { spreadRadar } from '../upstream/tools/insights';
import { scanMarkets } from '../upstream/tools/scan';
import { compareToExternalFx } from '../upstream/tools/external';
import { probeDepth, roundTripCost, inferBook } from '../upstream/tools/depth';
import { fxHistory, fxVolatility, corridorPnl } from '../upstream/tools/history';
import { treasuryValue, exposureReport, rebalancePlan, payInvoice } from '../upstream/tools/treasury';
import { doctor } from '../upstream/tools/admin';
import { findDeals } from '../upstream/tools/deals';
import { makerQuoteLadder, multiSourceMid } from '../upstream/tools/maker';
import { limitWatcher } from '../upstream/tools/watcher';
import { settlementStatus } from '../upstream/tools/settlement';
import { marketHealth, fxQuoteDiff, compareCorridors } from '../upstream/tools/health_corridors';

export type SeraMcpToolCategory =
  | 'discovery'
  | 'pricing'
  | 'liquidity'
  | 'quote_execute'
  | 'maker'
  | 'treasury'
  | 'settlement'
  | 'history'
  | 'admin';

export interface SeraMcpToolSpec<TInput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  category: SeraMcpToolCategory;
  safetyClass: ToolSafetyClass;
  idempotent: boolean;
  requiresApiKey?: boolean;
  handler: (ctx: AppContext, input: unknown) => Promise<unknown>;
}

function bindInput<TInput>(
  schema: z.ZodType<TInput, z.ZodTypeDef, unknown>,
  handler: (ctx: AppContext, input: TInput) => Promise<unknown>,
): (ctx: AppContext, input: unknown) => Promise<unknown> {
  return (ctx, input) => handler(ctx, schema.parse(input ?? {}));
}

function defineTool<TInput>(
  spec: Omit<SeraMcpToolSpec<TInput>, 'handler'> & {
    handler: (ctx: AppContext, input: TInput) => Promise<unknown>;
  },
): SeraMcpToolSpec<TInput> {
  return {
    ...spec,
    handler: bindInput(spec.schema, spec.handler),
  };
}

const commonErrorTemplates = {
  default: '{tool} failed: {message}',
  byCode: {
    validation: '{tool} rejected invalid input: {message}',
    policy: '{tool} was blocked by policy: {message}',
    upstream: 'Sera API call failed in {tool}: {message}',
  },
};

export const SERA_MCP_TOOL_SPECS = [
  defineTool({
    name: 'sera.list_currencies',
    description:
      "List supported stablecoins from Sera's live token registry. Use this before any swap to discover symbols, fiat tags, addresses, and decimals. Optionally filter by fiat (e.g. fiat='SGD'). Cached 5min server-side.",
    schema: ListCurrenciesInput,
    category: 'discovery',
    safetyClass: 'network',
    idempotent: true,
    handler: listCurrencies,
  }),
  defineTool({
    name: 'sera.get_markets',
    description:
      "List the active trading-pair catalog from /markets. NOTE: pair existence != tradeable now - use sera.scan_markets to find what's actually quotable. Cached 10min server-side.",
    schema: GetMarketsInput,
    category: 'discovery',
    safetyClass: 'network',
    idempotent: true,
    handler: (ctx) => getMarkets(ctx),
  }),
  defineTool({
    name: 'sera.get_fx_rate',
    description:
      "Sera's reference FX rate between two ISO currency codes (e.g. base='SGD', quote='USD'). Has measurable bid/ask asymmetry - for execution price, always use sera.get_quote. To detect Sera vs market bias, pair with sera.compare_to_external_fx. Cached 60s server-side.",
    schema: GetFxRateInput,
    category: 'pricing',
    safetyClass: 'network',
    idempotent: true,
    handler: getFxRate,
  }),
  defineTool({
    name: 'sera.compare_to_external_fx',
    description:
      "Diff Sera's /fx/rate against Frankfurter (ECB published mid). Surfaces systematic pricing bias. Inputs accept ISO fiat codes ('USD','SGD') OR Sera token symbols ('USDC','XSGD'). Note: Frankfurter updates daily, not real-time.",
    schema: CompareToExternalFxInput,
    category: 'pricing',
    safetyClass: 'network',
    idempotent: true,
    handler: compareToExternalFx,
  }),
  defineTool({
    name: 'sera.spread_radar',
    description:
      'Liquidity-free FX consistency monitor across a currency basket. Flags forward/reverse pair asymmetry and triangular drift. Useful as a pre-trade integrity check or to detect upstream pricing-source drift. Defaults: 150bps thresholds, USD/SGD/MYR/EUR/GBP/JPY basket.',
    schema: SpreadRadarInput,
    category: 'pricing',
    safetyClass: 'network',
    idempotent: true,
    handler: spreadRadar,
  }),
  defineTool({
    name: 'sera.scan_markets',
    description:
      'Fan out parallel /swap/quote probes across many pairs. Built for the deal-scanner pattern: one tool call instead of N round-trips. Default: 50 pairs, 8 concurrent, $100 notional, restricted to POLICY_ALLOWED_SYMBOLS. Reports quotable rate per pair and skip reasons.',
    schema: ScanMarketsInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: scanMarkets,
  }),
  defineTool({
    name: 'sera.find_deals',
    description:
      "End-to-end deal scanner: scan_markets + per-pair external mid comparison + filter >= min_deviation_bps. Returns ranked good_sell / good_buy / fair lists. Default benchmark = median of 3 free external FX sources (Frankfurter / open.er-api / exchangerate.host). Use_multi_source:false to compare against Sera's own /fx/rate instead.",
    schema: FindDealsInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: findDeals,
  }),
  defineTool({
    name: 'sera.maker_quote_ladder',
    description:
      'Spread-ladder calculator for makers. Given a pair, notional, and optional mid, returns earnings at 5/10/15/25/50/100/200 bps. Mid auto-fetched from multi-source median by default. Mirrors the Sera Spread Calculator UX as a single tool call.',
    schema: MakerQuoteLadderInput,
    category: 'maker',
    safetyClass: 'network',
    idempotent: true,
    handler: makerQuoteLadder,
  }),
  defineTool({
    name: 'sera.multi_source_mid',
    description:
      'Median FX mid across 3 free external sources (Frankfurter / open.er-api / exchangerate.host). Per-source rate, median, range_bps. Inputs accept ISO fiat or Sera token symbol. Resilient to a single source being down.',
    schema: MultiSourceMidInput,
    category: 'pricing',
    safetyClass: 'network',
    idempotent: true,
    handler: multiSourceMid,
  }),
  defineTool({
    name: 'sera.probe_depth',
    description:
      'Quote one corridor at a ladder of sizes to characterize price impact. Returns price-impact bps relative to the smallest probe. Use before sizing a real trade. Default sizes: [100, 1000, 10000, 100000].',
    schema: ProbeDepthInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: probeDepth,
  }),
  defineTool({
    name: 'sera.round_trip_cost',
    description:
      'Cost of A to B to A in bps. The spread floor a maker on this pair needs to cover their hedge. Returns absolute loss and bps interpretation.',
    schema: RoundTripCostInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: roundTripCost,
  }),
  defineTool({
    name: 'sera.infer_book',
    description:
      "Synthetic order book for a pair Sera doesn't publish a book for. Probes both directions at log-spaced sizes and constructs bid/ask ladders plus a synthetic spread. Use for visualizing depth, not for execution.",
    schema: InferBookInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: inferBook,
  }),
  defineTool({
    name: 'sera.market_health',
    description:
      'Quick yes/no on whether a corridor is quotable right now. Fires a single $1 simulate quote and returns one of: quotable, no_liquidity, unknown_pair, error. Cheaper than burning a full quote when you only need pre-flight gating.',
    schema: MarketHealthInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: marketHealth,
  }),
  defineTool({
    name: 'sera.fx_quote_diff',
    description:
      "Compare Sera's reference /fx/rate against the executable rate from a real quote at a chosen notional. Returns deviation in bps so an agent can decide if the displayed mid is close enough to the executable price to size a real swap.",
    schema: FxQuoteDiffInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: fxQuoteDiff,
  }),
  defineTool({
    name: 'sera.compare_corridors',
    description:
      "Given a target output (currency + amount), rank candidate source currencies by USD-equivalent cost. Treasury planning: 'I need to deliver 5,000 SGD - which of my source assets does it cheapest?'",
    schema: CompareCorridorsInput,
    category: 'liquidity',
    safetyClass: 'network',
    idempotent: true,
    handler: compareCorridors,
  }),
  defineTool({
    name: 'sera.get_quote',
    description:
      'Single-use Sera swap quote. Returns route_params (EIP-712 Intent) for the agent to sign + uuid + fee breakdown. Pass simulate:true to probe with the burn address (no execution possible). Enforces server policy (whitelist, recipient, max notional, slippage). Quotes embed gas via gas_mode.',
    schema: GetQuoteInput,
    category: 'quote_execute',
    safetyClass: 'financial',
    idempotent: false,
    handler: getQuote,
  }),
  defineTool({
    name: 'sera.prepare_swap',
    description:
      "Alias of get_quote intended for execution-track flows. Same policy gates apply. Use this name in agent prompts when intent is clearly 'about to execute' vs 'just price discovery'.",
    schema: PrepareSwapInput,
    category: 'quote_execute',
    safetyClass: 'financial',
    idempotent: false,
    handler: prepareSwap,
  }),
  defineTool({
    name: 'sera.execute_swap',
    description:
      'Submit a signed swap quote (uuid + EIP-712 signature) to Sera. External signer mode: agent provides signature. Local mode: server signs route_params. Quotes are single-use - handle QUOTE_STALE/410 by re-quoting. Gated by POLICY_DRY_RUN and POLICY_DAILY_VOLUME_CAP_USD when set.',
    schema: ExecuteSwapInput,
    category: 'quote_execute',
    safetyClass: 'financial',
    idempotent: false,
    handler: executeSwap,
  }),
  defineTool({
    name: 'sera.convert_and_send',
    description:
      'High-level: quote A to B and deliver to recipient in one call. Requires SERA_SIGNER_MODE=local. For external signer, use get_quote -> wallet sign -> execute_swap.',
    schema: ConvertAndSendInput,
    category: 'quote_execute',
    safetyClass: 'financial',
    idempotent: false,
    handler: convertAndSend,
  }),
  defineTool({
    name: 'sera.quote_recipient_amount',
    description:
      "Inverse: 'I want them to receive exactly X of currency B - what do I send of currency A?' Uses /fx/rate then two real quotes to tighten. Does NOT execute.",
    schema: QuoteRecipientAmountInput,
    category: 'quote_execute',
    safetyClass: 'financial',
    idempotent: false,
    handler: quoteRecipientAmount,
  }),
  defineTool({
    name: 'sera.find_cheapest_settlement_path',
    description:
      'Compare gas-mode candidates (receive_less vs pay_more) for one A to B and rank by min_output. Use for planning; each candidate consumes its own UUID.',
    schema: FindCheapestPathInput,
    category: 'quote_execute',
    safetyClass: 'financial',
    idempotent: false,
    handler: findCheapestPath,
  }),
  defineTool({
    name: 'sera.limit_watcher',
    description:
      "Patient quote: poll /swap/quote on a fixed budget until target_rate hit (or budget exhausted). Sera has no native limit orders - this is a poor-man's version. Default 5 attempts x 6s = about 30s blocking. Returns hit:true with last quote OR hit:false with probe history.",
    schema: LimitWatcherInput,
    category: 'quote_execute',
    safetyClass: 'financial',
    idempotent: false,
    handler: limitWatcher,
  }),
  defineTool({
    name: 'sera.settlement_status',
    description:
      'Query Sera /orders for trade history or a specific trade. Filter by trade_id, uuid, owner_address, status, limit. Requires SERA_API_KEY/SERA_API_SECRET - surfaces a clear gate when missing.',
    schema: SettlementStatusInput,
    category: 'settlement',
    safetyClass: 'financial',
    idempotent: true,
    requiresApiKey: true,
    handler: settlementStatus,
  }),
  defineTool({
    name: 'sera.get_balances',
    description:
      'Wallet + Vault balances for a wallet. Requires SERA_API_KEY/SERA_API_SECRET on the server. Output is normalized to human amounts.',
    schema: GetBalancesInput,
    category: 'treasury',
    safetyClass: 'financial',
    idempotent: true,
    requiresApiKey: true,
    handler: getBalances,
  }),
  defineTool({
    name: 'sera.treasury_value',
    description:
      'Aggregate balances across one or more wallets and value the portfolio in target_currency. Returns per-wallet rows + currency exposure breakdown. Requires SERA_API_KEY.',
    schema: TreasuryValueInput,
    category: 'treasury',
    safetyClass: 'financial',
    idempotent: true,
    requiresApiKey: true,
    handler: treasuryValue,
  }),
  defineTool({
    name: 'sera.exposure_report',
    description:
      'Slimmer cousin of treasury_value: just the currency mix and total. Use pre-trade when asking if a treasury is over-exposed to a currency.',
    schema: ExposureReportInput,
    category: 'treasury',
    safetyClass: 'financial',
    idempotent: true,
    requiresApiKey: true,
    handler: exposureReport,
  }),
  defineTool({
    name: 'sera.rebalance_plan',
    description:
      'Given target weights by fiat code and current balances, emit a list of suggested swaps to rebalance. Pure planner - does not execute. Each suggested trade can be fed into get_quote.',
    schema: RebalancePlanInput,
    category: 'treasury',
    safetyClass: 'financial',
    idempotent: true,
    requiresApiKey: true,
    handler: rebalancePlan,
  }),
  defineTool({
    name: 'sera.pay_invoice',
    description:
      "'I owe X of currency Y to address Z - given my source assets, what is the cheapest path?' Fans out across each candidate source and ranks by USD-equivalent cost.",
    schema: PayInvoiceInput,
    category: 'treasury',
    safetyClass: 'financial',
    idempotent: false,
    requiresApiKey: true,
    handler: payInvoice,
  }),
  defineTool({
    name: 'sera.fx_history',
    description:
      "Sera /fx/rate observations logged by THIS MCP since since_hours_ago. Requires SERA_HISTORY_DB env to be set. Sera does not publish OHLC - over time, the MCP becomes its own price feed.",
    schema: FxHistoryInput,
    category: 'history',
    safetyClass: 'read',
    idempotent: true,
    handler: (_ctx, input) => fxHistory(input),
  }),
  defineTool({
    name: 'sera.fx_volatility',
    description:
      'Stats over fx_history window: mean, stdev, range_bps, annualized vol estimate. Requires SERA_HISTORY_DB.',
    schema: FxHistoryInput,
    category: 'history',
    safetyClass: 'read',
    idempotent: true,
    handler: (_ctx, input) => fxVolatility(input),
  }),
  defineTool({
    name: 'sera.corridor_pnl',
    description:
      "What would holding the long side of this pair have realized over the window? Mark-to-market based on logged Sera /fx/rate; does not include swap costs. Requires SERA_HISTORY_DB.",
    schema: FxHistoryInput,
    category: 'history',
    safetyClass: 'read',
    idempotent: true,
    handler: (_ctx, input) => corridorPnl(input),
  }),
  defineTool({
    name: 'sera.doctor',
    description:
      'One-call self-check: API health, network sanity, signer mode, policy summary, persistence state. Use for quick is-everything-wired-right debugging.',
    schema: DoctorInput,
    category: 'admin',
    safetyClass: 'network',
    idempotent: true,
    handler: (ctx) => doctor(ctx),
  }),
] satisfies SeraMcpToolSpec[];

export const SERA_MCP_TOOL_NAMES = SERA_MCP_TOOL_SPECS.map((spec) => spec.name);

export function getSeraMcpToolSpec(name: string): SeraMcpToolSpec | undefined {
  return SERA_MCP_TOOL_SPECS.find((spec) => spec.name === name);
}

function toToolResult(spec: SeraMcpToolSpec, data: unknown): ToolResult {
  const serialized = JSON.stringify(data, null, 2);
  return {
    success: true,
    llmOutput: serialized,
    uiOutput: serialized,
    attachments: [
      {
        name: `${spec.name}-structured`,
        mimeType: 'application/json',
        content: serialized,
      },
    ],
  };
}

function toToolError(spec: SeraMcpToolSpec, error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    llmOutput: '',
    error: `Error in ${spec.name}: ${message}`,
  };
}

export function createSeraMcpTools(ctx: AppContext = loadConfig()): ToolContract[] {
  return SERA_MCP_TOOL_SPECS.map((spec) =>
    tool<unknown, unknown>({
      name: spec.name,
      description: spec.description,
      input: spec.schema,
      safetyClass: spec.safetyClass,
      idempotent: spec.idempotent,
      timeoutMs: spec.category === 'quote_execute' ? 60_000 : 30_000,
      retries: spec.idempotent ? 1 : 0,
      permissions: spec.requiresApiKey ? ['sera:api-key'] : undefined,
      metadata: {
        framework: 'veridex',
        source: 'sera-mcp',
        upstreamVersion: '0.4.0',
        category: spec.category,
        mcpName: spec.name,
        requiresApiKey: spec.requiresApiKey ?? false,
      },
      errorTemplates: commonErrorTemplates,
      async execute({ input }) {
        try {
          const data = await spec.handler(ctx, input ?? {});
          return toToolResult(spec, data);
        } catch (error) {
          return toToolError(spec, error);
        }
      },
    }),
  );
}

export const createSeraMcpToolContracts = createSeraMcpTools;
