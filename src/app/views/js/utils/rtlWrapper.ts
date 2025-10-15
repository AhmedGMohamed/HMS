/**
 * RTL (Right-to-Left) wrapper for pdfMake to support Arabic text
 * This version modifies pdfMake's createPdf method directly
 */

// Regex to detect Arabic characters
const ARABIC_REGEX =
	/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Check if text contains Arabic characters
 */
function containsArabic(text: string): boolean {
	return ARABIC_REGEX.test(text);
}

/**
 * Check if text is primarily Arabic (more than 30% Arabic chars)
 */
function isPrimarilyArabic(text: string): boolean {
	if (!text || typeof text !== "string") return false;

	const arabicChars = text.match(
		/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
	);
	if (!arabicChars) return false;

	const arabicRatio = arabicChars.length / text.replace(/\s/g, "").length;
	return arabicRatio > 0.3;
}

/**
 * Reverse word order in a sentence for RTL display
 * Preserves numbers and English words in their correct positions
 */
function reverseArabicText(text: string): string {
	if (!text || typeof text !== "string") return text;
	if (!containsArabic(text)) return text;

	// Split by spaces and reverse
	const words = text.split(" ");
	const reversed = words.reverse();

	return reversed.join(" ");
}

/**
 * Process a text element (string or text object) to add RTL support
 */
function processTextElement(element: any): any {
	// Handle string
	if (typeof element === "string") {
		if (isPrimarilyArabic(element)) {
			return {
				text: reverseArabicText(element),
				alignment: "right"
			};
		}
		return element;
	}

	// Handle text object
	if (element && typeof element === "object" && "text" in element) {
		const processed = { ...element };

		// Process the text property
		if (typeof processed.text === "string") {
			if (isPrimarilyArabic(processed.text)) {
				processed.text = reverseArabicText(processed.text);
				// Set alignment to right if not explicitly set
				if (!processed.alignment) {
					processed.alignment = "right";
				}
			}
		} else if (Array.isArray(processed.text)) {
			// Handle text arrays (mixed formatting)
			processed.text = processed.text.map((item: any) =>
				processTextElement(item)
			);
		}

		return processed;
	}

	// Handle array of text elements
	if (Array.isArray(element)) {
		return element.map((item: any) => processTextElement(item));
	}

	return element;
}

/**
 * Process table content for RTL support
 */
function processTable(table: any): any {
	if (!table || !table.body) return table;

	const processed = { ...table };
	processed.body = table.body.map((row: any[]) =>
		row.map((cell: any) => processTextElement(cell))
	);

	return processed;
}

/**
 * Process columns for RTL support
 */
function processColumns(columns: any[]): any[] {
	return columns.map((column: any) => {
		if (column && typeof column === "object") {
			const processed = { ...column };

			if ("text" in processed) {
				return processTextElement(processed);
			}

			if ("table" in processed) {
				processed.table = processTable(processed.table);
			}

			if ("columns" in processed) {
				processed.columns = processColumns(processed.columns);
			}

			return processed;
		}
		return processTextElement(column);
	});
}

/**
 * Recursively process the entire document definition for RTL support
 */
function processDocumentContent(content: any): any {
	if (!content) return content;

	// Handle arrays
	if (Array.isArray(content)) {
		return content.map((item: any) => processDocumentContent(item));
	}

	// Handle objects
	if (typeof content === "object") {
		const processed = { ...content };

		// Process text property
		if ("text" in processed) {
			const textResult = processTextElement(processed);
			Object.assign(processed, textResult);
		}

		// Process table
		if ("table" in processed) {
			processed.table = processTable(processed.table);
		}

		// Process columns
		if ("columns" in processed) {
			processed.columns = processColumns(processed.columns);
		}

		// Process stack
		if ("stack" in processed) {
			processed.stack = processDocumentContent(processed.stack);
		}

		// Process ul (unordered list)
		if ("ul" in processed) {
			processed.ul = processDocumentContent(processed.ul);
		}

		// Process ol (ordered list)
		if ("ol" in processed) {
			processed.ol = processDocumentContent(processed.ol);
		}

		return processed;
	}

	// Handle strings
	return processTextElement(content);
}

/**
 * Deep clone an object (handles nested structures)
 */
function deepClone(obj: any): any {
	if (obj === null || typeof obj !== "object") return obj;
	if (obj instanceof Date) return new Date(obj.getTime());
	if (obj instanceof Array) return obj.map((item) => deepClone(item));

	const clonedObj: any = {};
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			clonedObj[key] = deepClone(obj[key]);
		}
	}
	return clonedObj;
}

/**
 * Initialize RTL support by wrapping pdfMake's createPdf method
 * Call this once after pdfMake is loaded
 */
export function initRTLSupport(pdfMake: any): void {
	// Store the original createPdf method
	const originalCreatePdf = pdfMake.createPdf.bind(pdfMake);

	// Override createPdf with RTL-aware version
	pdfMake.createPdf = function (
		docDefinition: any,
		tableLayouts?: any,
		fonts?: any,
		vfs?: any
	) {
		// Deep clone to avoid mutating the original
		const clonedDoc = deepClone(docDefinition);

		// Process the document for RTL support
		const processedDoc = {
			...clonedDoc,
			content: processDocumentContent(clonedDoc.content)
		};

		// Call the original method with processed definition
		return originalCreatePdf(processedDoc, tableLayouts, fonts, vfs);
	};
}

/**
 * Utility to manually reverse text (for custom use cases)
 */
export function reverseRTLText(text: string): string {
	return reverseArabicText(text);
}

/**
 * Utility to check if text needs RTL processing
 */
export function needsRTLProcessing(text: string): boolean {
	return isPrimarilyArabic(text);
}

/**
 * Remove RTL support and restore original pdfMake behavior
 */
let originalCreatePdf: any = null;

export function removeRTLSupport(pdfMake: any): void {
	if (originalCreatePdf) {
		pdfMake.createPdf = originalCreatePdf;
		originalCreatePdf = null;
	}
}
