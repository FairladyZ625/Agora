# OpenClaw Local Setup

## Goal

Connect a local OpenClaw deployment to a locally running Agora instance.

## Assumption

Agora is already running locally:

```bash
./agora start
```

## Configure Plugin Endpoint

Point OpenClaw's Agora plugin config to your local Agora service:

```bash
openclaw config set plugins.entries.agora.config.serverUrl http://127.0.0.1:18420
```

If API auth is enabled, also set the token:

```bash
openclaw config set plugins.entries.agora.config.apiToken your-secret-token
```

## Validate

Check the Agora health endpoint:

```bash
curl http://127.0.0.1:18420/api/health
```

Check the plugin:

```bash
openclaw plugins info agora
```

## Use The Plugin In Discord

The current Agora plugin command surface is text-first.

Start with:

```text
/task
```

That returns the available task commands and common examples.

For a first create smoke:

```text
/task create "fix dashboard create flow" coding
```

If you forget the type, the plugin now returns guided text and the supported task types instead of only a terse usage line.

## Recommended Discord Policy

When OpenClaw and Agora share Discord channels, start with:

- `allowBots: true`
- `requireMention: true`

That keeps bot traffic visible but controlled.
