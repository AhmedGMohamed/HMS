import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	saveConfig: (config: any) => ipcRenderer.invoke("save-config", config),
	loadConfig: () => ipcRenderer.invoke("load-config"),
	testServer: (serverUrl: string) =>
		ipcRenderer.invoke("test-server", serverUrl),
	startApp: () => ipcRenderer.invoke("start-app"),
	openConfigPage: () => ipcRenderer.invoke("open-config-page")
});
