import { describe, expect, it } from "vitest";
import {
  isDiscordLoginUrl,
  normalizeDiscordSmokeCommands,
  parseRunningChromeRemoteDebuggingPort,
  splitSlashCommand,
} from "./discord-web-slash-lib";

describe("parseRunningChromeRemoteDebuggingPort", () => {
  it("returns the remote debugging port for the matching persistent profile", () => {
    const processList = [
      "chrome --user-data-dir=/tmp/other --remote-debugging-port=51111 about:blank",
      "chrome --user-data-dir=/Users/lizeyu/Library/Caches/ms-playwright/mcp-chrome --remote-debugging-port=60888 about:blank",
    ].join("\n");

    expect(
      parseRunningChromeRemoteDebuggingPort(
        processList,
        "/Users/lizeyu/Library/Caches/ms-playwright/mcp-chrome",
      ),
    ).toBe(60888);
  });

  it("returns null when no matching persistent profile is running", () => {
    const processList = "chrome --user-data-dir=/tmp/other --remote-debugging-port=51111 about:blank";

    expect(
      parseRunningChromeRemoteDebuggingPort(
        processList,
        "/Users/lizeyu/Library/Caches/ms-playwright/mcp-chrome",
      ),
    ).toBeNull();
  });
});

describe("normalizeDiscordSmokeCommands", () => {
  it("drops blank commands and trims whitespace", () => {
    expect(
      normalizeDiscordSmokeCommands([
        "  /task create  ",
        "",
        "   ",
        "/task coding",
      ]),
    ).toEqual(["/task create", "/task coding"]);
  });
});

describe("isDiscordLoginUrl", () => {
  it("detects discord login redirects", () => {
    expect(isDiscordLoginUrl("https://discord.com/login?redirect_to=%2Fchannels%2F%40me")).toBe(true);
    expect(isDiscordLoginUrl("https://discord.com/channels/@me")).toBe(false);
  });
});

describe("splitSlashCommand", () => {
  it("splits slash command name from arguments", () => {
    expect(splitSlashCommand("/project list active")).toEqual({
      commandName: "/project",
      argsText: "list active",
    });
  });

  it("handles slash commands without arguments", () => {
    expect(splitSlashCommand("/task")).toEqual({
      commandName: "/task",
      argsText: "",
    });
  });
});
