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
	if (isDev()) {
		// Development: views are in src/electron/views
		return path.join(app.getAppPath(), "dist-electron/electron/views", viewFile);
	} else {
		// Production: views are in resources/views
		return path.join(process.resourcesPath, "views", viewFile);
	}
}

export function getAssetPath(assetPath: string): string {
	if (isDev()) {
		// Development: assets are in src/electron/assets
		return path.join(app.getAppPath(), "dist-electron/electron/assets", assetPath);
	} else {
		// Production: assets are in resources/assets
		return path.join(process.resourcesPath, "assets", assetPath);
	}
}
