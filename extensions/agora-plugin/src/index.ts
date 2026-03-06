import { AgoraBridge } from "./bridge";
import { registerTaskCommands } from "./commands";
import type { OpenClawPluginApi } from "./types";

export default function register(api: OpenClawPluginApi): void {
  const configured = api.pluginConfig?.serverUrl;
  const serverUrl = typeof configured === "string" && configured.trim()
    ? configured
    : "http://127.0.0.1:8420";

  const bridge = new AgoraBridge(serverUrl);
  registerTaskCommands(api, bridge);

  api.logger.info(`Agora plugin loaded (${serverUrl})`);
}
