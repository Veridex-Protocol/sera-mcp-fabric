# @veridex/sera-mcp-fabric

Veridex-native rebuild of `sera-mcp`.

This package preserves the upstream Sera MCP execution surface while wrapping it in `@veridex/agents` tool contracts, Veridex runtime composition, and MCP-compatible exposure.

## What is preserved

- 32 `sera.*` tools with the same names, schemas, descriptions, and handler behavior.
- 5 `sera://` resources.
- 4 `sera.*` prompt templates.
- Hardcoded Sera network URLs with explicit custom-host override friction.
- Signer modes: `external`, `local`, and `readonly`.
- Quote registry binding for UUID to `route_params`.
- Policy presets, symbol/recipient gates, notional caps, dry-run kill switch, and daily volume gates.

## What is better

- Every upstream handler is available as a typed Veridex `ToolContract`.
- Tool metadata carries source category, safety class, idempotency, and upstream parity details.
- The same tools can be embedded in a Veridex `AgentRuntime` or exposed through MCP.
- Tests assert tool-name parity, prompt/resource parity, and safety-class assignment.

## Commands

```bash
bun run --filter @veridex/sera-mcp-fabric test
bun run --filter @veridex/sera-mcp-fabric lint
bun run --filter @veridex/sera-mcp-fabric build
```

Run the MCP stdio server after build:

```bash
SERA_NETWORK=mainnet POLICY_PRESET=standard node sera-mcp-fabric/dist/mcp/stdio.mjs
```

The upstream source is vendored under `src/upstream` as the parity baseline. Veridex wrapper code lives outside that directory.
