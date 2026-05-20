import { describe, expect, it } from 'vitest';
import { listPrompts } from '../src/upstream/prompts';
import { listResources } from '../src/upstream/resources';

describe('sera-mcp resources and prompts', () => {
  it('preserves the 5 upstream MCP resources', () => {
    expect(listResources().map((resource) => resource.uri)).toEqual([
      'sera://currencies',
      'sera://markets',
      'sera://config',
      'sera://help/tools',
      'sera://help/quickstart',
    ]);
  });

  it('preserves the 4 upstream prompt templates', () => {
    expect(listPrompts().map((prompt) => prompt.name)).toEqual([
      'sera.deal_scan',
      'sera.treasury_brief',
      'sera.invoice_optimizer',
      'sera.fx_integrity_check',
    ]);
  });
});
