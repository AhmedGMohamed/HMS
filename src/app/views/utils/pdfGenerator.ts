import { Patient } from "../../utils/types/patients.js";
import { Bill, BillDetail } from "../../utils/types/billing.js";


// Declare global pdfMake and pdfFonts (set by <script> tags)
declare global {
    interface Window {
        pdfMake: {
            createPdf: (docDefinition: any) => any;
            vfs?: any;
            fonts?: any;
        };
    }
}
const pdfMake = { ...window.pdfMake };

// Debug: Verify pdfMake after setup
console.log("pdfMake after vfs setup:", pdfMake);

export function generatePatientBill(
	patient: Patient,
	bill: Bill,
	billDetails: BillDetail[]
) {
	// Calculate subtotal from billDetails
	const subtotal = billDetails.reduce(
		(sum, detail) => sum + detail.quantity * detail.unit_price,
		0
	);

	const docDefinition = {
		content: [
			/*{
				text: "HOSPITAL MANAGEMENT SYSTEM",
				style: "header",
				alignment: "center"
			},*/
			{
				text: "PATIENT BILL",
				style: /*"subheader"*/"header",
				alignment: "center"
			},
			{
				columns: [
					{
						width: "*",
						text: [
							{ text: "Patient: ", bold: true },
							patient.name,
							"\n",
							{ text: "Phone: ", bold: true },
							patient.phone || "N/A",
							"\n",
							{ text: "Payment Type: ", bold: true },
							patient.payment_type.charAt(0).toUpperCase() +
								patient.payment_type.slice(1)
						]
					},
					{
						width: "*",
						text: [
							{ text: "Bill ID: ", bold: true },
							bill.bill_id.toString(),
							"\n",
							{ text: "Date: ", bold: true },
							bill.generated_at
								? new Date(
										bill.generated_at
								  ).toLocaleDateString()
								: "N/A",
							"\n",
							{ text: "Status: ", bold: true },
							bill.paid_amount >= bill.total_amount
								? "Paid"
								: "Pending"
						]
					}
				]
			},
			{
				text: "BILL DETAILS",
				style: "subheader",
				margin: [0, 20, 0, 10]
			},
			{
				table: {
					headerRows: 1,
					widths: ["*", "auto", "auto", "auto"],
					body: [
						["Description", "Quantity", "Unit Price", "Total"],
						...billDetails.map((detail) => [
							detail.service_name ||
								detail.drug_name ||
								"Unknown Item",
							detail.quantity.toString(),
							`$${detail.unit_price}`,
							`$${detail.quantity * detail.unit_price}`
						])
					]
				}
			},
			{
				columns: [
					{ width: "*", text: "" },
					{
						width: 200,
						table: {
							body: [
								["Subtotal:", `$${subtotal}`],
								["Discount:", `$${bill.discount}`],
								[
									"Administrative:",
									`$${bill.administrative_expenses}`
								],
								[
									"VAT:",
									`$${
										bill.vat_percentage
											? (subtotal - bill.discount) *
											  (bill.vat_percentage / 100)
											: "0.00"
									}`
								],
								[
									"Total:",
									{
										text: `$${bill.total_amount}`,
										bold: true
									}
								],
								["Paid:", `$${bill.paid_amount}`],
								[
									"Balance:",
									{
										text: `$${
											bill.total_amount - bill.paid_amount
										}`,
										bold: true
									}
								]
							]
						},
						layout: "noBorders"
					}
				]
			}
		],
		styles: {
			header: {
				fontSize: 18,
				bold: true,
				margin: [0, 0, 0, 10]
			},
			subheader: {
				fontSize: 14,
				bold: true,
				margin: [0, 10, 0, 5]
			}
		}
	};
	//@ts-nocheck
	return pdfMake.createPdf(docDefinition);
}
