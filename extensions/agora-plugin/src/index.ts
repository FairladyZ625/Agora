import { AgoraBridge } from "./bridge";
import { registerTaskCommands } from "./commands";
import { registerLiveStatusBridge } from "./live-status";
import type { OpenClawPluginApi } from "./types";

export default function register(api: OpenClawPluginApi): void {
  const configured = api.pluginConfig?.serverUrl;
  const tokenConfigured = api.pluginConfig?.apiToken;
  const serverUrl = typeof configured === "string" && configured.trim()
    ? configured
    : (process.env.AGORA_SERVER_URL?.trim() || "http://127.0.0.1:18420");
  const apiToken = typeof tokenConfigured === "string" && tokenConfigured.trim()
    ? tokenConfigured.trim()
    : undefined;

  const bridge = new AgoraBridge(serverUrl, apiToken);
  registerTaskCommands(api, bridge);
  registerLiveStatusBridge(api, bridge);

  api.logger.info(`Agora plugin loaded (${serverUrl})`);
}
