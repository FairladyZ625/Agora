import { describe, expect, it, vi } from "vitest";

import register from "../src/index";

describe("plugin register", () => {
  it("wires the bridge with configured server and api token", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const registerCommand = vi.fn();

    register({
      logger,
      registerCommand,
      pluginConfig: {
        serverUrl: "http://localhost:9000",
        apiToken: "  secret-token  ",
      },
    });

    expect(registerCommand).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith("Agora plugin loaded (http://localhost:9000)");
  });

  it("falls back to the default local server when plugin config is blank", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const registerCommand = vi.fn();

    register({
      logger,
      registerCommand,
      pluginConfig: {
        serverUrl: "   ",
      },
    });

    expect(registerCommand).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith("Agora plugin loaded (http://127.0.0.1:8420)");
  });
});
