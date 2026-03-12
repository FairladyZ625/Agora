import { z } from 'zod';

const allowedGraphNodeKinds = ['stage', 'terminal'] as const;
const allowedGraphEdgeKinds = ['advance', 'reject', 'timeout', 'branch', 'complete'] as const;

export const templateGraphNodeKindSchema = z.enum(allowedGraphNodeKinds);
export type TemplateGraphNodeKindDto = z.infer<typeof templateGraphNodeKindSchema>;

export const templateGraphEdgeKindSchema = z.enum(allowedGraphEdgeKinds);
export type TemplateGraphEdgeKindDto = z.infer<typeof templateGraphEdgeKindSchema>;

export const templateGraphNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  kind: templateGraphNodeKindSchema.default('stage'),
  execution_kind: z.string().min(1).optional(),
  allowed_actions: z.array(z.string().min(1)).optional(),
  gate: z.object({
    type: z.string().min(1).optional(),
    approver: z.string().min(1).optional(),
    approver_role: z.string().min(1).optional(),
    required: z.number().int().positive().optional(),
    timeout_sec: z.number().int().positive().optional(),
  }).strict().nullish(),
  layout: z.object({
    x: z.number(),
    y: z.number(),
  }).strict().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type TemplateGraphNodeDto = z.infer<typeof templateGraphNodeSchema>;

export const templateGraphEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: templateGraphEdgeKindSchema,
  condition: z.string().optional(),
  priority: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type TemplateGraphEdgeDto = z.infer<typeof templateGraphEdgeSchema>;

export const templateGraphSchema = z.object({
  graph_version: z.number().int().positive(),
  entry_nodes: z.array(z.string().min(1)).min(1),
  nodes: z.array(templateGraphNodeSchema).min(1),
  edges: z.array(templateGraphEdgeSchema),
}).strict().superRefine((value, ctx) => {
  const nodeIds = new Set<string>();
  for (const [index, node] of value.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate graph node id: ${node.id}`,
        path: ['nodes', index, 'id'],
      });
      continue;
    }
    nodeIds.add(node.id);
  }
  for (const [index, nodeId] of value.entry_nodes.entries()) {
    if (!nodeIds.has(nodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown entry node: ${nodeId}`,
        path: ['entry_nodes', index],
      });
    }
  }
  const edgeIds = new Set<string>();
  for (const [index, edge] of value.edges.entries()) {
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate graph edge id: ${edge.id}`,
        path: ['edges', index, 'id'],
      });
    } else {
      edgeIds.add(edge.id);
    }
    if (!nodeIds.has(edge.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown edge.from node: ${edge.from}`,
        path: ['edges', index, 'from'],
      });
    }
    if (!nodeIds.has(edge.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown edge.to node: ${edge.to}`,
        path: ['edges', index, 'to'],
      });
    }
  }
});
export type TemplateGraphDto = z.infer<typeof templateGraphSchema>;
