# Agora TS

TypeScript rewrite workspace for Agora v2.

## Quality Gates

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run check
npm run check:strict
npm run scenario:list
npm run scenario -- happy-path --json
npm run scenario:all
```

## Packages

- `apps/server` - Fastify HTTP server
- `apps/cli` - CLI entrypoint
- `packages/contracts` - shared DTO/schema contracts
- `packages/core` - orchestration domain logic
- `packages/db` - SQLite access and migrations
- `packages/config` - config schema and loader
- `packages/testing` - test runtime helpers
