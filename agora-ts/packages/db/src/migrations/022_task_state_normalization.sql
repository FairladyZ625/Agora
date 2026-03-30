UPDATE tasks
SET state = CASE state
  WHEN 'closed' THEN 'cancelled'
  WHEN 'completed' THEN 'done'
  WHEN 'in_progress' THEN 'active'
  WHEN 'gate_waiting' THEN 'active'
  WHEN 'pending' THEN 'created'
  ELSE state
END
WHERE state IN ('closed', 'completed', 'in_progress', 'gate_waiting', 'pending');
