import { describe, expect, it } from "vitest";
import {
  buildDiscordWebQueryArgs,
  DEFAULT_MIN_QUIET_MS,
  DEFAULT_SETTLE_TIMEOUT_MS,
} from "./smoke-discord-web-query";

describe("buildDiscordWebQueryArgs", () => {
  it("injects tighter query-suite settle defaults before the default commands", () => {
    expect(buildDiscordWebQueryArgs([])).toEqual([
      "scripts/smoke-discord-web-slash.ts",
      "--settle-timeout-ms",
      String(DEFAULT_SETTLE_TIMEOUT_MS),
      "--min-quiet-ms",
      String(DEFAULT_MIN_QUIET_MS),
      "--command",
      "/project list active",
      "--command",
      "/project show {{firstActiveProjectId}}",
      "--command",
      "/task list active",
      "--command",
      "/task status {{firstActiveTaskId}}",
      "--command",
      "/task",
      "--command",
      "/project",
    ]);
  });

  it("lets later passthrough args override defaults", () => {
    expect(buildDiscordWebQueryArgs(["--settle-timeout-ms", "5000"]).slice(-2)).toEqual([
      "--settle-timeout-ms",
      "5000",
    ]);
  });
});
