import { z } from 'zod';
import { taskStateSchema } from './task.js';

export const workspaceBootstrapStatusSchema = z.object({
  runtime_ready: z.boolean(),
  runtime_readiness_reason: z.string().nullable(),
  bootstrap_task_id: z.string().nullable(),
  bootstrap_task_title: z.string().nullable(),
  bootstrap_task_state: taskStateSchema.nullable(),
  bootstrap_completed: z.boolean(),
});

export type WorkspaceBootstrapStatusDto = z.infer<typeof workspaceBootstrapStatusSchema>;
