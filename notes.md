# Notes: Agora Week 2 Planning

## Week 1 完成情况
- 12 个 Python enums (enums.py)
- SQLite schema 9 张表 + DatabaseManager (db.py)
- StateMachine: 状态转移 + Gate 检查（MVP 简化版）+ DAG 工作流
- TaskManager: 两阶段创建 + advance + pause/resume/cancel + cleanup
- 6 个任务模板 + 4 个治理预设
- typer CLI: create/status/list/advance/cleanup
- 验证通过: 任务可从 draft → active → done，flow_log 完整

## Week 1 遗留的 MVP 简化
1. archon_review Gate 简化为 command 行为（无 Dashboard/Discord 审批）
2. 无 OpenClaw Adapter（纯本地 CLI）
3. 无权限校验（任何 caller 都通过）
4. 无 ProgressSync（只有 flow_log）
5. 无 Scheduler（无超时/重试/回滚）
6. 无 ModeController（无 discuss/execute 模式切换）

## Week 2 设计文档参考
- 30 天排期 Week 2: Day 8-14 适配器联通周
- 07-implementation-plan Phase 0 后半 + Phase 1a
- 01-architecture.md: Adapter 抽象接口、权限矩阵
- 02-task-lifecycle.md: Gate 系统、状态转移触发器
- 06-commands-api.md: 命令 API 定义

## OpenClaw Plugin SDK 研究结果

### 关键发现：不需要改源码，Plugin SDK 功能完整
- `api.registerCommand()` 注册 /task 命令
- `api.on("subagent_spawned", ...)` 监听 subagent 事件
- `runtime.channel.discord` 提供 Thread 操作
- `spawnSubagentDirect()` 可派发 subagent 到指定 Thread
- Thread Bindings API 支持绑定/解绑/TTL 管理
- Plugin 可注册 HTTP routes（供 Python core 回调）
- Plugin 可注册 services（后台服务）

### 插件架构方案
```
OpenClaw Plugin (TypeScript)          Agora Core (Python)
┌─────────────────────┐              ┌──────────────────┐
│ /task commands       │──HTTP/IPC──→│ TaskMgr          │
│ Thread management    │              │ StateMachine     │
│ Agent dispatch       │←─callback──│ GateKeeper       │
│ Hook listeners       │              │ Permission       │
└─────────────────────┘              └──────────────────┘
```

### 关键文件
- Plugin SDK: src/plugin-sdk/index.ts
- Command types: src/plugins/types.ts (OpenClawPluginApi, PluginCommandContext)
- Thread bindings: src/discord/monitor/thread-bindings.ts
- Subagent spawn: src/auto-reply/reply/commands-subagents/action-spawn.ts
- Example plugin: extensions/device-pair/index.ts
