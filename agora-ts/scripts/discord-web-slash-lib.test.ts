import { describe, expect, it } from "vitest";
import {
  isDiscordLoginUrl,
  isDiscordPendingResponse,
  normalizeDiscordSmokeCommands,
  parseRunningChromeRemoteDebuggingPort,
  resolveSmokeCommandTemplate,
  splitSlashCommand,
  shouldSettleDiscordResponse,
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

describe("resolveSmokeCommandTemplate", () => {
  it("replaces active entity placeholders", () => {
    expect(
      resolveSmokeCommandTemplate("/project show {{firstActiveProjectId}}", {
        firstActiveProjectId: "proj-api",
      }),
    ).toBe("/project show proj-api");
    expect(
      resolveSmokeCommandTemplate("/task status {{firstActiveTaskId}}", {
        firstActiveTaskId: "OC-1",
      }),
    ).toBe("/task status OC-1");
  });

  it("throws when required replacements are missing", () => {
    expect(() => resolveSmokeCommandTemplate("/project show {{firstActiveProjectId}}", {})).toThrow(
      "missing replacement for {{firstActiveProjectId}}",
    );
  });
});

describe("isDiscordPendingResponse", () => {
  it("detects Discord in-progress response markers", () => {
    expect(isDiscordPendingResponse("Chronicle-Agent正在响应……")).toBe(true);
    expect(isDiscordPendingResponse("Chronicle-Agent is responding")).toBe(true);
    expect(isDiscordPendingResponse("proj-api | active | API Project")).toBe(false);
  });
});

describe("shouldSettleDiscordResponse", () => {
  it("waits for new non-pending output and a quiet period", () => {
    expect(
      shouldSettleDiscordResponse({
        beforeText: "before",
        currentText: "before\nproj-api | active | API Project",
        quietMs: 2600,
        minQuietMs: 2500,
      }),
    ).toBe(true);
  });

  it("does not settle while the response is still pending", () => {
    expect(
      shouldSettleDiscordResponse({
        beforeText: "before",
        currentText: "before\nChronicle-Agent正在响应……",
        quietMs: 2600,
        minQuietMs: 2500,
      }),
    ).toBe(false);
  });

  it("does not settle before a quiet period elapses", () => {
    expect(
      shouldSettleDiscordResponse({
        beforeText: "before",
        currentText: "before\nproj-api | active | API Project",
        quietMs: 800,
        minQuietMs: 2500,
      }),
    ).toBe(false);
  });
});
