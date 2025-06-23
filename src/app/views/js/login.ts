//@ts-ignore
import Swal from "./sweetalert2/src/sweetalert2.js";

class LoginManager {
	private form: HTMLFormElement;
	private usernameInput: HTMLInputElement;
	private passwordInput: HTMLInputElement;
	private togglePasswordBtn: HTMLButtonElement;
	private submitButton: HTMLButtonElement;
	private loadingSpinner: HTMLElement;
	private buttonText: HTMLElement;

	constructor() {
		// Initialize form elements
		this.form = document.getElementById("loginForm") as HTMLFormElement;
		this.usernameInput = document.getElementById(
			"username"
		) as HTMLInputElement;
		this.passwordInput = document.getElementById(
			"password"
		) as HTMLInputElement;
		this.togglePasswordBtn = document.getElementById(
			"togglePassword"
		) as HTMLButtonElement;
		this.submitButton = this.form.querySelector(
			'button[type="submit"]'
		) as HTMLButtonElement;
		this.loadingSpinner = this.submitButton.querySelector(
			".spinner-border"
		) as HTMLElement;
		this.buttonText = this.submitButton.querySelector(
			".btn-text"
		) as HTMLElement;

		// Bind event listeners
		this.form.addEventListener("submit", this.handleSubmit.bind(this));
		this.togglePasswordBtn.addEventListener(
			"click",
			this.togglePasswordVisibility.bind(this)
		);
		this.setupInputValidation();
	}

	private setupInputValidation(): void {
		// Add input event listeners for real-time validation
		[this.usernameInput, this.passwordInput].forEach((input) => {
			input.addEventListener("input", () => {
				if (input.value.trim()) {
					input.classList.remove("is-invalid");
				}
			});
		});
	}

	private togglePasswordVisibility(): void {
		const type =
			this.passwordInput.type === "password" ? "text" : "password";
		this.passwordInput.type = type;

		const icon = this.togglePasswordBtn.querySelector("i");
		if (icon) {
			icon.className = `bi bi-eye${
				type === "password" ? "-fill" : "-slash-fill"
			}`;
		}
	}

	private setLoading(loading: boolean): void {
		this.submitButton.disabled = loading;
		this.loadingSpinner.classList.toggle("d-none", !loading);
		this.buttonText.textContent = loading ? "Logging in..." : "Login";
	}

	private validateForm(): boolean {
		let isValid = true;

		// Validate username
		if (!this.usernameInput.value.trim()) {
			this.usernameInput.classList.add("is-invalid");
			isValid = false;
		}

		// Validate password
		if (!this.passwordInput.value.trim()) {
			this.passwordInput.classList.add("is-invalid");
			isValid = false;
		}

		return isValid;
	}

	private async handleSubmit(event: Event): Promise<void> {
		event.preventDefault();

		if (!this.validateForm()) {
			return;
		}

		this.setLoading(true);

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					username: this.usernameInput.value.trim(),
					password: this.passwordInput.value
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Login failed");
			}

			// Store token and user data
			localStorage.setItem("token", data.token);
			localStorage.setItem("user", JSON.stringify(data.user));

			// Show success message
			await Swal.fire({
				icon: "success",
				title: "Login Successful",
				text: "Welcome back!",
				timer: 750,
				showConfirmButton: false
			});

			window.location.href = "/dashboard"
		} catch (error) {
			console.error("Login error:", error);

			Swal.fire({
				icon: "error",
				title: "Login Failed",
				text:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
				confirmButtonColor: "#0d6efd"
			});
		} finally {
			this.setLoading(false);
		}
	}
}

// Initialize login manager when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	new LoginManager();
});
