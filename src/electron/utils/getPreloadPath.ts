import path from "path";
import { app } from "electron";
import { isDev } from "./isDev.js";

export function getPreloadPath() {
	return path.join(
		app.getAppPath(),
		isDev() ? "." : "..",
		"/dist-electron/electron/preload.cjs"
	);
}
