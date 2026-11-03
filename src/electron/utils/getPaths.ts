import path from "path";
import { app } from "electron";
import { isDev } from "./isDev.js";

export function getPreloadPath(): string {
	return path.join(
		app.getAppPath(),
		isDev() ? "." : "..",
		"/dist-electron/electron/preload.cjs"
	);
}

export function getViewPath(viewFile: string): string {
	return path.join(app.getAppPath(), isDev() ? "." : "..", "dist-electron/electron/views", viewFile);
}

export function getAssetPath(assetPath: string): string {
	return path.join(
		app.getAppPath(),
		isDev() ? "." : "..",
		"dist-electron/electron/assets",
		assetPath
	);
}
