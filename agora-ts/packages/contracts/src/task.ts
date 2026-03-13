import { z } from 'zod';

export const taskStateSchema = z.enum([
  'draft',
  'created',
  'active',
  'done',
  'blocked',
  'paused',
  'cancelled',
  'orphaned',
]);

export const taskPrioritySchema = z.enum([
  'low',
  'normal',
  'high',
]);

export const taskControlModeSchema = z.enum([
  'normal',
  'smoke_test',
]);

export type TaskState = z.infer<typeof taskStateSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskControlMode = z.infer<typeof taskControlModeSchema>;
