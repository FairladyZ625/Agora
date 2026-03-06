# Agora 项目约定

## 项目概述
Agora 是一个多 Agent 民主编排框架，基于 SQLite + Python 实现。

## 目录结构
```
agora/
├── core/           # 编排层核心（enums, db, task_mgr, state_machine）
├── adapters/       # 适配层（base + openclaw）
├── craftsmen/      # 工匠层（CLI 调度）
├── templates/      # 任务模板 + 治理预设 JSON
├── scripts/        # CLI 工具（agora_cli.py）
├── tests/          # 测试
└── config/         # 配置示例
```

## 技术栈
- Python 3.11+
- SQLite（WAL 模式 + 乐观锁）
- typer（CLI 框架）
- enum.Enum + str mixin

## 编码规范
- 枚举使用 `class XxxState(str, Enum)` 模式
- 所有枚举值必须与 `docs/01-PLANS/ENUMS.md` 完全一致
- JSON 字段用 TEXT 存储在 SQLite 中
- 所有写操作使用事务（BEGIN → 操作 → COMMIT）
- 乐观锁：UPDATE 时校验 version 字段

## 设计文档
- 架构：`docs/01-PLANS/01-architecture.md`
- 生命周期：`docs/01-PLANS/02-task-lifecycle.md`
- 枚举定义：`docs/01-PLANS/ENUMS.md`

## OpenClaw 环境（集成参考）
- 配置目录：`/Users/lizeyu/.openclaw/`
- 源码目录：`/Users/lizeyu/Projects/openclaw/`
- Agora 设计文档副本：`/Users/lizeyu/.openclaw/docs/plans/agora/`

## Git 提交规范
- 提交人：ZeyuLi
- 前缀：feat/fix/refactor/docs/test
- 信息聚焦变更本身，不提 AI
