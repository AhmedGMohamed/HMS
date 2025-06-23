import { app, BrowserWindow, globalShortcut } from "electron";
import { getPreloadPath } from "./utils/getPreloadPath.js";
import expressApp from "../app/index.js";
import dotenv from "dotenv";
import { devDatabase } from "./utils/devDatabase.js";
import { isDev } from "./utils/isDev.js";

dotenv.config();

if (!isDev()) {
	process.env.NODE_ENV = "prod";
	process.env.JWT_SECRET = "1234abc#";
	process.env.DB_USER = "postgres";
	process.env.DB_HOST = "localhost";
	process.env.DB_NAME = "HMS";
	process.env.DB_PASSWORD = "postgres";
	process.env.DB_PORT = "5432";
	process.env.DB_USER_TEST = "postgres";
	process.env.DB_HOST_TEST = "localhost";
	process.env.DB_NAME_TEST = "HMS_test";
	process.env.DB_PASSWORD_TEST = "041805";
	process.env.DB_PORT_TEST = "5432";
}

let mainWindow: BrowserWindow | null;
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1920,
		height: 1080,
		webPreferences: {
			devTools: false
		},
		autoHideMenuBar: true
	});
	mainWindow.menuBarVisible = false;
	mainWindow.loadURL("http://localhost:3000");

	mainWindow.on("closed", async () => {
		if (isDev()) {
			await devDatabase.clearDatabase();
		}
		mainWindow = null;
	});
}

app.on("ready", async () => {
	await devDatabase.seedDatabase();

	if (!isDev()) {
		globalShortcut.register("Control+Shift+I", () => {
			return false;
		});
	}
	expressApp.listen(3000, () => {
		console.log("Server started on port 3000");
	});
	createWindow();
});

app.on("window-all-closed", async () => {
	if (isDev()) {
		await devDatabase.clearDatabase();
	}
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null) {
		createWindow();
	}
});
