import { z } from 'zod';
import catalog from './capabilities.json' with { type: 'json' };

export const CAPABILITIES = catalog;
export const capabilitySchema = z.object({
  id: z.string().max(120).optional(),
  group: z.string().max(80).optional(),
  status: z.enum(['available', 'partial', 'planned']).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(30),
  includeSchemas: z.boolean().default(false),
}).strict();

export function discoverCapabilities(args, tools) {
  const { id, group, status, offset, limit, includeSchemas } = capabilitySchema.parse(args);
  if (id && !catalog.some(item => item.id === id)) throw new Error(`Unknown capability: ${id}`);
  if (group && !catalog.some(item => item.group === group)) throw new Error(`Unknown capability group: ${group}`);
  const filtered = catalog.filter(item => (!id || item.id === id) && (!group || item.group === group) && (!status || item.status === status));
  const items = filtered.slice(offset, offset + limit);
  const schemas = includeSchemas ? Object.fromEntries([...new Set(items.flatMap(item => item.tools))].map(name => {
    const tool = tools[name];
    if (!tool) throw new Error(`Catalog references an unregistered tool: ${name}`);
    return [name, { description: tool.description, inputSchema: z.toJSONSchema(tool.schema, { target: 'draft-7' }) }];
  })) : undefined;
  return {
    catalogVersion: 1, total: filtered.length, offset, limit,
    groups: [...new Set(catalog.map(item => item.group))],
    statusMeaning: {
      available: 'The described operation is implemented, not proof of full save/reload or dual-agent acceptance. Read notes and tests.',
      partial: 'Only the listed tool operations and schema fields are implemented; the remaining GUI capability is not connected.',
      planned: 'Inventory only. No callable MCP implementation; do not infer support from GUI or loader source.',
    },
    items, ...(schemas ? { schemas } : {}),
  };
}
