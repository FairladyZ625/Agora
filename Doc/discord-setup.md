# Discord Setup

## What You Need

Before running `./agora init`, collect:

- a Discord Bot Token
- a default channel ID
- an optional admin Discord user ID

## Create The Bot

1. Open Discord Developer Portal.
2. Create a new application.
3. Create a bot under that application.
4. Copy the bot token.

Recommended intents for the first setup:

- Message Content Intent
- Server Members Intent

## Invite The Bot

For the first successful setup, using administrator permissions is the easiest path.

If you prefer a narrower policy, make sure the bot can at least:

- view channels
- send messages
- create threads
- send messages in threads
- manage threads

## Get IDs

Enable Developer Mode in Discord, then:

- right-click the target channel and copy its ID
- right-click the human admin account and copy its user ID

## Fill Agora Config

Run:

```bash
./agora init
```

Choose `Discord` as the IM provider, then enter:

- `Discord Bot Token`
- `默认频道 ID`
- whether task creation should create a Discord thread
- `管理员 Discord 用户 ID`

## OpenClaw Note

If OpenClaw is also consuming the same Discord surface, the recommended first-wave policy is:

- `allowBots: true`
- `requireMention: true`

This avoids uncontrolled bot reply loops while still allowing task threads to be shared.
