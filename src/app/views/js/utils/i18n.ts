interface TranslationObject {
	[key: string]: string | TranslationObject;
}

interface Translations {
	[locale: string]: TranslationObject;
}

class I18n {
	private currentLocale: string;
	private translations: Translations = {};
	private fallbackLocale: string = "en";
	private isInitialized: boolean = false;

	constructor() {
		this.currentLocale =
			this.getStoredLocale() || this.detectBrowserLocale();
	}

	public async init(): Promise<void> {
		if (this.isInitialized) return;

		await this.loadTranslations();
		this.setupLanguageSwitcher();
		this.isInitialized = true;
	}

	private getStoredLocale(): string | null {
		return localStorage.getItem("locale");
	}

	private detectBrowserLocale(): string {
		const browserLang = navigator.language.split("-")[0];
		return ["en", "ar"].includes(browserLang) ? browserLang : "en";
	}

	private async loadTranslations(): Promise<void> {
		try {
			const response = await fetch(`/locales/${this.currentLocale}.json`);
			if (!response.ok) throw new Error("Failed to load translations");

			this.translations[this.currentLocale] = await response.json();
			this.applyLocale();
		} catch (error) {
			console.error("Error loading translations:", error);

			if (this.currentLocale !== this.fallbackLocale) {
				this.currentLocale = this.fallbackLocale;
				await this.loadTranslations();
			}
		}
	}

	public async setLocale(locale: string): Promise<void> {
		if (locale === this.currentLocale) return;

		this.currentLocale = locale;
		localStorage.setItem("locale", locale);

		if (!this.translations[locale]) {
			await this.loadTranslations();
		} else {
			this.applyLocale();
		}

		// Reload page to ensure all dynamic content is updated
		window.location.reload();
	}

	private applyLocale(): void {
		// Set HTML attributes
		document.documentElement.lang = this.currentLocale;
		document.documentElement.dir =
			this.currentLocale === "ar" ? "rtl" : "ltr";

		// Add/remove RTL class
		if (this.currentLocale === "ar") {
			document.body.classList.add("rtl");
		} else {
			document.body.classList.remove("rtl");
		}

		// Load RTL CSS if Arabic
		this.loadRTLStyles();

		// Update language indicator
		this.updateLanguageIndicator();

		// Translate all elements with data-i18n attribute
		this.translatePage();

		// Dispatch event for custom handlers
		window.dispatchEvent(
			new CustomEvent("localeChanged", {
				detail: { locale: this.currentLocale }
			})
		);
	}

	private loadRTLStyles(): void {
		const rtlLinks = document.getElementsByClassName(
			"rtl-css"
		) as HTMLCollectionOf<HTMLLinkElement>;
		if (!rtlLinks) return;
		const bootstrapRtlLink = document.getElementById("bootstrap-rtl-css") as HTMLLinkElement;
		const bootstrapLtrLink = document.getElementById("bootstrap-css") as HTMLLinkElement;

		Array.from(rtlLinks).forEach((rtlLink) => {
			if (this.currentLocale === "ar") {
				rtlLink.disabled = false;
				bootstrapRtlLink.disabled = false;
				bootstrapLtrLink.disabled = true;
			} else {
				rtlLink.disabled = true;
				bootstrapRtlLink.disabled = true;
				bootstrapLtrLink.disabled = false;
			}
		});
	}

	private updateLanguageIndicator(): void {
		const currentLanguageElement =
			document.getElementById("currentLanguage");
		if (currentLanguageElement) {
			currentLanguageElement.textContent =
				this.currentLocale === "ar" ? "ع" : "EN";
		}

		// Update checkmarks
		document.querySelectorAll(".language-option").forEach((option) => {
			const lang = option.getAttribute("data-lang");
			const checkmark = option.querySelector(
				".language-check"
			) as HTMLElement;

			if (checkmark) {
				if (lang === this.currentLocale) {
					checkmark.style.display = "inline-block";
				} else {
					checkmark.style.display = "none";
				}
			}
		});
	}

	private setupLanguageSwitcher(): void {
		document.querySelectorAll(".language-option").forEach((option) => {
			option.addEventListener("click", (e) => {
				e.preventDefault();
				const lang = (e.currentTarget as HTMLElement).getAttribute(
					"data-lang"
				);
				if (lang) {
					this.setLocale(lang);
				}
			});
		});
	}

	private translatePage(): void {
		// Translate text content
		document.querySelectorAll("[data-i18n]").forEach((element) => {
			const key = element.getAttribute("data-i18n");
			if (!key) return;

			const paramsAttr = element.getAttribute("data-i18n-params");
			let params: Record<string, string | number> | undefined;

			if (paramsAttr) {
				try {
					params = JSON.parse(paramsAttr);
				} catch (e) {
					console.warn("Invalid i18n params:", paramsAttr);
				}
			}

			const translation = this.t(key, params);

			if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
				(element as HTMLInputElement).placeholder = translation;
			} else {
				element.textContent = translation;
			}
		});

		// Translate placeholders
		document
			.querySelectorAll("[data-i18n-placeholder]")
			.forEach((element) => {
				const key = element.getAttribute("data-i18n-placeholder");
				if (key) {
					(element as HTMLInputElement).placeholder = this.t(key);
				}
			});

		// Translate titles
		document.querySelectorAll("[data-i18n-title]").forEach((element) => {
			const key = element.getAttribute("data-i18n-title");
			if (key) {
				element.setAttribute("title", this.t(key));
			}
		});

		// Translate aria-labels
		document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
			const key = element.getAttribute("data-i18n-aria");
			if (key) {
				element.setAttribute("aria-label", this.t(key));
			}
		});
	}

	public t(key: string, params?: Record<string, string | number>): string {
		const keys = key.split(".");
		let value: any = this.translations[this.currentLocale];

		for (const k of keys) {
			if (value && typeof value === "object" && k in value) {
				value = value[k];
			} else {
				// Fallback to English if key not found
				value = this.translations[this.fallbackLocale];
				for (const fallbackKey of keys) {
					if (
						value &&
						typeof value === "object" &&
						fallbackKey in value
					) {
						value = value[fallbackKey];
					} else {
						console.warn(`Translation key not found: ${key}`);
						return key;
					}
				}
				break;
			}
		}

		if (typeof value !== "string") {
			console.warn(`Translation value is not a string: ${key}`);
			return key;
		}

		// Replace parameters
		if (params) {
			Object.keys(params).forEach((param) => {
				value = value.replace(
					new RegExp(`{{${param}}}`, "g"),
					String(params[param])
				);
			});
		}

		return value;
	}

	public getCurrentLocale(): string {
		return this.currentLocale;
	}

	public isRTL(): boolean {
		return this.currentLocale === "ar";
	}

	public formatNumber(num: number, decimals: number = 2, en: boolean = false): string {
		if (this.currentLocale === "ar" && !en) {
			return num.toLocaleString("ar-EG", {
				useGrouping: false,
				minimumFractionDigits: decimals,
				maximumFractionDigits: decimals
			});
		}
		return num.toLocaleString("en-US", {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		});
	}

	public formatDate(
		date: Date | string,
		format: "short" | "long" = "short"
	): string {
		const dateObj = typeof date === "string" ? new Date(date) : date;

		if (this.currentLocale === "ar") {
			return dateObj.toLocaleDateString("ar-EG", {
				year: "numeric",
				month: format === "long" ? "long" : "2-digit",
				day: "2-digit"
			});
		}

		return dateObj.toLocaleString("en-US", {
			year: "numeric",
			month: format === "long" ? "long" : "2-digit",
			day: "2-digit"
		});
	}

	public formatTime(date: Date | string): string {
		const dateObj = typeof date === "string" ? new Date(date) : date;

		if (this.currentLocale === "ar") {
			return dateObj.toLocaleTimeString("ar-EG", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: true
			});
		}

		return dateObj.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true
		});
	}

	public formatDateTime(date: Date | string): string {
		return `${this.formatDate(date)} ${this.formatTime(date)}`;
	}

	public formatCurrency(amount: number, en: boolean = false): string {
		const formatted = this.formatNumber(amount, 2, en);
		return this.currentLocale === "ar" && !en
			? `${formatted} ${this.t("common.currency")}`
			: `${this.t("common.currency")} ${formatted}`;
	}
}

// Export singleton instance
export const i18n = new I18n();

// Auto-initialize when loaded
if (typeof window !== "undefined") {
	document.addEventListener("DOMContentLoaded", () => {
		i18n.init();
	});
}
