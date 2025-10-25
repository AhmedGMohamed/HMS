import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import dotenv from "dotenv";
import { isDev } from "./utils/isDev.js";
import { configStore, isConfigComplete, setConfig, getConfig } from "./utils/configStore.js";
import { getPreloadPath, getViewPath } from "./utils/getPaths.js";

dotenv.config();

let mainWindow: BrowserWindow | null;
let configWindow: BrowserWindow | null;

function createConfigWindow() {
    configWindow = new BrowserWindow({
        width: 700,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: getPreloadPath()
        },
        autoHideMenuBar: true,
        resizable: false,
        center: true,
        title: 'HMS Configuration'
    });

    configWindow.loadFile(getViewPath('config.html'));

    if (isDev()) {
        configWindow.webContents.openDevTools();
    }

    configWindow.on('closed', () => {
        configWindow = null;
    });
}

function createMainWindow() {
    const config = getConfig();
    
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            devTools: isDev(),
            nodeIntegration: false,
            contextIsolation: true,
            preload: getPreloadPath()
        },
        autoHideMenuBar: true,
        show: false,
        title: 'Hospital Management System'
    });

    mainWindow.menuBarVisible = false;
    
    // Load the configured server URL
    mainWindow.loadURL(config.serverUrl);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    // Handle failed loads
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorDescription);
        
        if (mainWindow) {
            mainWindow.loadFile(getViewPath('connection-error.html'));
        }
    });

    if (isDev()) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// IPC Handlers
ipcMain.handle('save-config', async (event, config) => {
    try {
        // Validate config
        if (!config.serverUrl) {
            return {
                success: false,
                message: 'Server URL is required'
            };
        }

        // Validate URL format
        try {
            new URL(config.serverUrl);
        } catch (error) {
            return {
                success: false,
                message: 'Invalid server URL format'
            };
        }

        // Test server connection before saving
        const serverTest = await testServerConnection(config.serverUrl);
        if (!serverTest.success) {
            return {
                success: false,
                message: `Server connection failed: ${serverTest.message}`
            };
        }

        // Save configuration
        setConfig({
            serverUrl: config.serverUrl,
            isConfigured: true
        });

        return {
            success: true,
            message: 'Configuration saved successfully'
        };
    } catch (error) {
        console.error('Error saving config:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to save configuration'
        };
    }
});

ipcMain.handle('load-config', async () => {
    try {
        const config = getConfig();
        return {
            serverUrl: config.serverUrl
        };
    } catch (error) {
        console.error('Error loading config:', error);
        return null;
    }
});

ipcMain.handle('test-server', async (event, serverUrl) => {
    return await testServerConnection(serverUrl);
});

ipcMain.handle("start-app", async () => {
	try {
		if (configWindow) {
			configWindow.close();
			configWindow = null;
		}

		createMainWindow();
	} catch (error) {
		console.error("Error starting app:", error);
		throw error;
	}
});

ipcMain.handle("open-config-page", async () => {
	if (configWindow) {
		configWindow.focus();
		return;
	}

	createConfigWindow();
});

async function testServerConnection(
	serverUrl: string
): Promise<{ success: boolean; message: string }> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 5000);

	try {
		const response = await fetch(`${serverUrl}/api/health`, {
			method: "GET",
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		// Emulate validateStatus: accept any status < 500
		if (response.status < 500) {
			if (response.status === 200) {
				return {
					success: true,
					message: "Server is running and accessible"
				};
			} else if (response.status === 404) {
				return {
					success: true,
					message: "Server is accessible"
				};
			} else {
				return {
					success: false,
					message: `Server responded with status ${response.status}`
				};
			}
		} else {
			return {
				success: false,
				message: `Server responded with status ${response.status}`
			};
		}
	} catch (error) {
		clearTimeout(timeoutId);
		console.error("Server connection test failed:", error);

		let message = "Failed to connect to the server. ";

		if (error instanceof Error) {
			if (error.name === "AbortError") {
				message +=
					"Connection timeout. Please check the URL and network.";
			} else if (error.message.includes("Failed to fetch")) {
				// This typically means: DNS failure, connection refused, or network down
				message +=
					"Server not found or connection refused. Please check if the server is running and the URL is correct.";
			} else {
				message += error.message;
			}
		} else {
			message += "Unknown error occurred.";
		}

		return {
			success: false,
			message
		};
	}
}

app.on("ready", async () => {
	// Register keyboard shortcuts
	if (!isDev()) {
		// Disable DevTools in production
		globalShortcut.register("Control+Shift+I", () => false);
		globalShortcut.register("F12", () => false);
	}

	// Register shortcut to open config page
	globalShortcut.register("Control+Shift+C", () => {
		if (!configWindow) {
			createConfigWindow();
		} else {
			configWindow.focus();
		}
	});

	// Check if configuration exists
	if (isConfigComplete()) {
		try {
			const config = getConfig();

			// Test if server is accessible before creating main window
			const serverTest = await testServerConnection(config.serverUrl);

			if (serverTest.success) {
				createMainWindow();
			} else {
				console.error("Server not accessible:", serverTest.message);
				// Show config window
				createConfigWindow();
			}
		} catch (error) {
			console.error("Failed to load configuration:", error);
			createConfigWindow();
		}
	} else {
		// Show configuration window
		createConfigWindow();
	}
});

app.on("window-all-closed", () => {
	globalShortcut.unregisterAll();

	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null && configWindow === null) {
		if (isConfigComplete()) {
			createMainWindow();
		} else {
			createConfigWindow();
		}
	}
});

app.on("will-quit", () => {
	globalShortcut.unregisterAll();
});