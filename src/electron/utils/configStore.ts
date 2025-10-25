import Store from "electron-store";

interface ConfigSchema {
	serverUrl: string;
	dbUser: string;
	dbHost: string;
	dbName: string;
	dbPassword: string;
	dbPort: string;
	jwtSecret: string;
	isConfigured: boolean;
}

export const configStore = new Store<ConfigSchema>({
	name: "hms-config",
	encryptionKey: "hms-secure-key-2024", // Change this to a more secure key
	defaults: {
		serverUrl: "",
		dbUser: "",
		dbHost: "",
		dbName: "",
		dbPassword: "",
		dbPort: "",
		jwtSecret: "",
		isConfigured: false
	}
});

export function isConfigComplete(): boolean {
	const config = configStore.store;
	return !!(
		config.serverUrl &&
		config.dbUser &&
		config.dbHost &&
		config.dbName &&
		config.dbPassword &&
		config.dbPort &&
		config.jwtSecret &&
		config.isConfigured
	);
}

export function getConfig() {
	return configStore.store;
}

export function setConfig(config: Partial<ConfigSchema>) {
	Object.entries(config).forEach(([key, value]) => {
		configStore.set(key as keyof ConfigSchema, value);
	});
}

export function clearConfig() {
	configStore.clear();
}