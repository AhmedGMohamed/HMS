interface ConfigData {
	serverUrl: string;
}

declare global {
	interface Window {
		electronAPI: {
			saveConfig: (
				config: ConfigData
			) => Promise<{ success: boolean; message: string }>;
			loadConfig: () => Promise<ConfigData | null>;
			testServer: (
				serverUrl: string
			) => Promise<{ success: boolean; message: string }>;
			startApp: () => Promise<void>;
			openConfigPage: () => Promise<void>;
		};
	}
}

document.addEventListener("DOMContentLoaded", () => {
	const retryBtn = document.getElementById("retryBtn") as HTMLButtonElement;
	const configBtn = document.getElementById("configBtn") as HTMLButtonElement;

	retryBtn.addEventListener("click", () => {
		location.reload();
	});

	configBtn.addEventListener("click", async () => {
		if (window.electronAPI && window.electronAPI.openConfigPage) {
			await window.electronAPI.openConfigPage();
		}
	});
});
