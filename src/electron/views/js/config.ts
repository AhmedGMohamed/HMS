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

document.addEventListener("DOMContentLoaded", async () => {
	const form = document.getElementById("configForm") as HTMLFormElement;
	const testServerBtn = document.getElementById(
		"testServer"
	) as HTMLButtonElement;
	const serverUrlInput = document.getElementById(
		"serverUrl"
	) as HTMLInputElement;
	const exampleButtons = document.querySelectorAll(".example-url");

	// Load existing config if available
	try {
		const existingConfig = await window.electronAPI.loadConfig();
		if (existingConfig && existingConfig.serverUrl) {
			serverUrlInput.value = existingConfig.serverUrl;
		}
	} catch (error) {
		console.error("Error loading config:", error);
	}

	// Example URL buttons
	exampleButtons.forEach((button) => {
		button.addEventListener("click", () => {
			const url = button.getAttribute("data-url");
			if (url) {
				serverUrlInput.value = url;
				serverUrlInput.focus();
			}
		});
	});

	// Test server connection
	testServerBtn.addEventListener("click", async () => {
		const serverUrl = serverUrlInput.value.trim();

		if (!serverUrl) {
			showAlert(
				"warning",
				"Missing Information",
				"Please enter a server URL first."
			);
			serverUrlInput.focus();
			return;
		}

		// Validate URL format
		try {
			new URL(serverUrl);
		} catch (error) {
			showAlert(
				"danger",
				"Invalid URL",
				"Please enter a valid server URL (e.g., http://localhost:3000)"
			);
			serverUrlInput.classList.add("is-invalid");
			serverUrlInput.focus();
			return;
		}

		serverUrlInput.classList.remove("is-invalid");
		testServerBtn.classList.add("loading");
		testServerBtn.disabled = true;

		try {
			const result = await window.electronAPI.testServer(serverUrl);

			if (result.success) {
				showAlert("success", "Connection Successful!", result.message);
				serverUrlInput.classList.add("is-valid");
				setTimeout(() => {
					serverUrlInput.classList.remove("is-valid");
				}, 3000);
			} else {
				showAlert("danger", "Connection Failed", result.message);
				serverUrlInput.classList.add("is-invalid");
			}
		} catch (error) {
			showAlert(
				"danger",
				"Connection Error",
				"Failed to connect to the server. Please check if the server is running."
			);
			serverUrlInput.classList.add("is-invalid");
		} finally {
			testServerBtn.classList.remove("loading");
			testServerBtn.disabled = false;
		}
	});

	// Form submission
	form.addEventListener("submit", async (e) => {
		e.preventDefault();

		if (!form.checkValidity()) {
			form.reportValidity();
			return;
		}

		const config = getFormData();

		// Validate URL format
		try {
			new URL(config.serverUrl);
		} catch (error) {
			showAlert(
				"danger",
				"Invalid URL",
				"Please enter a valid server URL."
			);
			serverUrlInput.classList.add("is-invalid");
			serverUrlInput.focus();
			return;
		}

		const submitBtn = form.querySelector(
			'button[type="submit"]'
		) as HTMLButtonElement;
		submitBtn.classList.add("loading");
		submitBtn.disabled = true;

		try {
			const result = await window.electronAPI.saveConfig(config);

			if (result.success) {
				showAlert(
					"success",
					"Configuration Saved!",
					"Starting application..."
				);
				serverUrlInput.classList.add("is-valid");

				setTimeout(async () => {
					await window.electronAPI.startApp();
				}, 1500);
			} else {
				showAlert("danger", "Save Failed", result.message);
				submitBtn.classList.remove("loading");
				submitBtn.disabled = false;
			}
		} catch (error) {
			showAlert(
				"danger",
				"Error",
				"Failed to save configuration. Please try again."
			);
			submitBtn.classList.remove("loading");
			submitBtn.disabled = false;
		}
	});

	function getFormData(): ConfigData {
		return {
			serverUrl: serverUrlInput.value.trim().replace(/\/$/, "") // Remove trailing slash
		};
	}

	function showAlert(type: string, title: string, message: string) {
		const existingAlert = document.querySelector(".dynamic-alert");
		if (existingAlert) {
			existingAlert.remove();
		}

		const alert = document.createElement("div");
		alert.className = `alert alert-${type} alert-dismissible fade show dynamic-alert`;
		alert.innerHTML = `
            <strong>${title}</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

		form.insertBefore(alert, form.firstChild);

		// Auto-dismiss after 5 seconds
		setTimeout(() => {
			alert.remove();
		}, 5000);
	}
});
