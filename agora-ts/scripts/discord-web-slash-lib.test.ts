import { describe, expect, it } from "vitest";
import {
  type DiscordSmokeCommandSpec,
  extractDiscordResponseDelta,
  expectedMarkersForSlashCommand,
  isDiscordLoginUrl,
  isDiscordPendingResponse,
  normalizeDiscordSmokeCommandSpecs,
  normalizeDiscordSmokeCommands,
  parseRunningChromeRemoteDebuggingPort,
  resolveSmokeCommandTemplate,
  slashCommandAssertionPassed,
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

describe("normalizeDiscordSmokeCommandSpecs", () => {
  it("trims commands and responders and drops blanks", () => {
    const specs: DiscordSmokeCommandSpec[] = [
      { command: "  /project  ", responder: "  Codex Main  " },
      { command: "   " },
      { command: "/task" },
    ];
    expect(normalizeDiscordSmokeCommandSpecs(specs)).toEqual([
      { command: "/project", responder: "Codex Main" },
      { command: "/task", responder: undefined },
    ]);
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

describe("expectedMarkersForSlashCommand", () => {
  it("returns stable markers for known query/help commands", () => {
    expect(expectedMarkersForSlashCommand("/project show proj-api")).toEqual(["knowledge=", "index="]);
    expect(expectedMarkersForSlashCommand("/task status OC-1")).toEqual(["flow_log=", "subtasks="]);
    expect(expectedMarkersForSlashCommand("/task")).toEqual(["Agora /task commands:", "Most common:"]);
  });
});

describe("slashCommandAssertionPassed", () => {
  it("passes when the response body includes expected markers", () => {
    expect(
      slashCommandAssertionPassed(
        "/project show proj-api",
        "proj-api | active | API Project\nknowledge=3, recaps=0, citizens=0\nindex=present, timeline=present",
      ),
    ).toBe(true);
  });

  it("fails when expected markers are missing", () => {
    expect(slashCommandAssertionPassed("/task status OC-1", "OC-1 | active | review")).toBe(false);
  });
});

describe("isDiscordPendingResponse", () => {
  it("detects Discord in-progress response markers", () => {
    expect(isDiscordPendingResponse("Chronicle-Agent正在响应……")).toBe(true);
    expect(isDiscordPendingResponse("Chronicle-Agent is responding")).toBe(true);
    expect(isDiscordPendingResponse("proj-api | active | API Project")).toBe(false);
  });
});

describe("extractDiscordResponseDelta", () => {
  it("returns only the appended tail when the new body extends the previous body", () => {
    expect(
      extractDiscordResponseDelta(
        "before\nline-a",
        "before\nline-a\nline-b",
      ),
    ).toBe("\nline-b");
  });

  it("falls back to the current body when the full text is reflowed", () => {
    expect(extractDiscordResponseDelta("before", "rewritten")).toBe("rewritten");
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

  it("settles once the expected markers are present even if older pending text remains elsewhere in the page", () => {
    expect(
      shouldSettleDiscordResponse({
        beforeText: "old text\nChronicle-Agent正在响应……",
        currentText: "old text\nChronicle-Agent正在响应……\nproj-api | active | API Project",
        quietMs: 2600,
        minQuietMs: 2500,
        assertionPassed: true,
      }),
    ).toBe(true);
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

  it("does not settle early when a command has explicit markers that are still missing", () => {
    expect(
      shouldSettleDiscordResponse({
        beforeText: "before",
        currentText: "before\nsome unrelated output",
        quietMs: 2600,
        minQuietMs: 2500,
        assertionPassed: false,
        hasExpectedMarkers: true,
      }),
    ).toBe(false);
  });
});
