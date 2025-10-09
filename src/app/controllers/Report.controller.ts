// src/app/controllers/Report.controller.ts
import { Request, Response } from "express";
import ReportModel from "../models/Report.model.js";
import {
	TimeGrouping,
	PaymentTypeFilter,
	EmployeeTypeFilter,
	ReportDateRange
} from "../utils/types/reports.js";

export default class ReportController {
	// ==================== PATIENT REPORTS ====================

	/**
	 * Get patient reports filtered by payment type
	 */
	static async getPatientReports(req: Request, res: Response): Promise<void> {
		try {
			const { start_date, end_date, payment_type, insurance_id } =
				req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const paymentTypeFilter =
				(payment_type as PaymentTypeFilter) || "all";
			const insuranceIdNum = insurance_id
				? parseInt(insurance_id as string)
				: undefined;

			const reports = await ReportModel.getPatientReports(
				dateRange,
				paymentTypeFilter,
				insuranceIdNum
			);

			res.status(200).json(reports);
		} catch (error: any) {
			console.error("Error fetching patient reports:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch patient reports"
			});
		}
	}

	/**
	 * Get formatted patient reports for PDF
	 */
	static async getPatientReportsFormatted(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const {
				start_date,
				end_date,
				payment_type,
				insurance_id,
				patient_id
			} = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const paymentTypeFilter =
				(payment_type as PaymentTypeFilter) || "all";
			const insuranceIdNum = insurance_id
				? parseInt(insurance_id as string)
				: undefined;
			const patientIdNum = patient_id
				? parseInt(patient_id as string)
				: undefined;

			const reports = await ReportModel.getPatientReportFormatted(
				dateRange,
				paymentTypeFilter,
				insuranceIdNum,
				patientIdNum
			);

			res.status(200).json(reports);
		} catch (error: any) {
			console.error("Error fetching formatted patient reports:", error);
			res.status(500).json({
				error:
					error.message || "Failed to fetch formatted patient reports"
			});
		}
	}

	/**
	 * Get single admission formatted data
	 */
	static async getSingleAdmissionFormatted(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const patientHistoryId = parseInt(req.params.admissionId);

			if (isNaN(patientHistoryId)) {
				res.status(400).json({ error: "Invalid admission ID" });
				return;
			}

			const data = await ReportModel.getSingleAdmissionFormatted(
				patientHistoryId
			);
			res.status(200).json(data);
		} catch (error: any) {
			console.error("Error fetching single admission data:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch admission data"
			});
		}
	}

	// ==================== DOCTOR REPORTS ====================

	/**
	 * Get patients referred by a specific doctor
	 */
	static async getPatientsReferredByDoctor(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const doctorId = parseInt(req.params.doctorId);
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const report = await ReportModel.getPatientsReferredByDoctor(
				doctorId,
				dateRange
			);
			res.status(200).json(report);
		} catch (error: any) {
			console.error("Error fetching referred patients:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch referred patients"
			});
		}
	}

	/**
	 * Get all patients referred by all doctors
	 */
	static async getAllPatientsReferredByDoctors(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const reports = await ReportModel.getAllPatientsReferredByDoctors(
				dateRange
			);
			res.status(200).json(reports);
		} catch (error: any) {
			console.error("Error fetching all referred patients:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch all referred patients"
			});
		}
	}

	/**
	 * Get patients attended by a specific doctor
	 */
	static async getPatientsAttendedByDoctor(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const doctorId = parseInt(req.params.doctorId);
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const report = await ReportModel.getPatientsAttendedByDoctor(
				doctorId,
				dateRange
			);
			res.status(200).json(report);
		} catch (error: any) {
			console.error("Error fetching attended patients:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch attended patients"
			});
		}
	}

	/**
	 * Get all patients attended by all doctors
	 */
	static async getAllPatientsAttendedByDoctors(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const reports = await ReportModel.getAllPatientsAttendedByDoctors(
				dateRange
			);
			res.status(200).json(reports);
		} catch (error: any) {
			console.error("Error fetching all attended patients:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch all attended patients"
			});
		}
	}

	/**
	 * Get patients supervised by a specific supervising doctor
	 */
	static async getPatientsSupervisedByDoctor(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const doctorId = parseInt(req.params.doctorId);
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const report = await ReportModel.getPatientsSupervisedByDoctor(
				doctorId,
				dateRange
			);
			res.status(200).json(report);
		} catch (error: any) {
			console.error("Error fetching supervised patients:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch supervised patients"
			});
		}
	}

	// ==================== NURSE REPORTS ====================

	/**
	 * Get patients attended by a specific nurse
	 */
	static async getPatientsAttendedByNurse(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const nurseId = parseInt(req.params.nurseId);
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const report = await ReportModel.getPatientsAttendedByNurse(
				nurseId,
				dateRange
			);
			res.status(200).json(report);
		} catch (error: any) {
			console.error("Error fetching nurse attended patients:", error);
			res.status(500).json({
				error:
					error.message || "Failed to fetch nurse attended patients"
			});
		}
	}

	/**
	 * Get all patients attended by all nurses
	 */
	static async getAllPatientsAttendedByNurses(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const reports = await ReportModel.getAllPatientsAttendedByNurses(
				dateRange
			);
			res.status(200).json(reports);
		} catch (error: any) {
			console.error("Error fetching all nurse attended patients:", error);
			res.status(500).json({
				error:
					error.message ||
					"Failed to fetch all nurse attended patients"
			});
		}
	}

	// ==================== STATISTICAL REPORTS ====================

	/**
	 * Get patient statistics with time grouping
	 */
	static async getPatientStatistics(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";
			const statistics = await ReportModel.getPatientStatistics(
				dateRange,
				timeGrouping
			);

			res.status(200).json(statistics);
		} catch (error: any) {
			console.error("Error fetching patient statistics:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch patient statistics"
			});
		}
	}

	/**
	 * Get patient statistics with chart data
	 */
	static async getPatientStatisticsWithChart(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";
			const statistics = await ReportModel.getPatientStatistics(
				dateRange,
				timeGrouping
			);

			// Generate chart data
			const chartData =
				ReportModel.generatePatientStatisticsChart(statistics);

			res.status(200).json({
				data: statistics,
				chartData: chartData,
				chartType: "line"
			});
		} catch (error: any) {
			console.error(
				"Error fetching patient statistics with chart:",
				error
			);
			res.status(500).json({
				error: error.message || "Failed to fetch patient statistics"
			});
		}
	}

	/**
	 * Get patient statistics by payment type with chart
	 */
	static async getPatientStatisticsByPaymentType(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";
			const statistics = await ReportModel.getPatientStatistics(
				dateRange,
				timeGrouping
			);

			// Generate pie chart for payment type distribution
			const chartData = ReportModel.generatePaymentTypeChart(statistics);

			res.status(200).json({
				data: statistics,
				chartData: chartData,
				chartType: "pie"
			});
		} catch (error: any) {
			console.error("Error fetching payment type statistics:", error);
			res.status(500).json({
				error:
					error.message || "Failed to fetch payment type statistics"
			});
		}
	}

	static async getAverageStayByTime(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";
			const data = await ReportModel.getAverageStayByTime(
				dateRange,
				timeGrouping
			);

			res.status(200).json(data);
		} catch (error: any) {
			console.error("Error fetching average stay data:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch average stay data"
			});
		}
	}

	/**
	 * Get revenue trends
	 */
	static async getRevenueTrends(req: Request, res: Response): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";
			const data = await ReportModel.getRevenueTrends(
				dateRange,
				timeGrouping
			);

			res.status(200).json(data);
		} catch (error: any) {
			console.error("Error fetching revenue trends:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch revenue trends"
			});
		}
	}

	/**
	 * Get admission vs discharge trends
	 */
	static async getAdmissionDischargeTrends(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";
			const data = await ReportModel.getAdmissionDischargeTrends(
				dateRange,
				timeGrouping
			);

			res.status(200).json(data);
		} catch (error: any) {
			console.error("Error fetching admission/discharge trends:", error);
			res.status(500).json({
				error:
					error.message ||
					"Failed to fetch admission/discharge trends"
			});
		}
	}

	/**
	 * Get top services
	 */
	static async getTopServices(req: Request, res: Response): Promise<void> {
		try {
			const { start_date, end_date, limit } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const limitNum = limit ? parseInt(limit as string) : 10;
			const data = await ReportModel.getTopServices(dateRange, limitNum);

			res.status(200).json(data);
		} catch (error: any) {
			console.error("Error fetching top services:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch top services"
			});
		}
	}

	/**
	 * Get top drugs
	 */
	static async getTopDrugs(req: Request, res: Response): Promise<void> {
		try {
			const { start_date, end_date, limit } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const limitNum = limit ? parseInt(limit as string) : 10;
			const data = await ReportModel.getTopDrugs(dateRange, limitNum);

			res.status(200).json(data);
		} catch (error: any) {
			console.error("Error fetching top drugs:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch top drugs"
			});
		}
	}

	/**
	 * Get staff utilization
	 */
	static async getStaffUtilization(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const data = await ReportModel.getStaffUtilization(dateRange);

			res.status(200).json(data);
		} catch (error: any) {
			console.error("Error fetching staff utilization:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch staff utilization"
			});
		}
	}

	/**
	 * Get comprehensive statistics dashboard
	 */
	static async getComprehensiveStatistics(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";

			// Fetch all statistics in parallel
			const [
				patientStats,
				avgStay,
				revenue,
				admissionDischarge,
				topServices,
				topDrugs,
				staffUtil
			] = await Promise.all([
				ReportModel.getPatientStatistics(dateRange, timeGrouping),
				ReportModel.getAverageStayByTime(dateRange, timeGrouping),
				ReportModel.getRevenueTrends(dateRange, timeGrouping),
				ReportModel.getAdmissionDischargeTrends(
					dateRange,
					timeGrouping
				),
				ReportModel.getTopServices(dateRange, 10),
				ReportModel.getTopDrugs(dateRange, 10),
				ReportModel.getStaffUtilization(dateRange)
			]);

			res.status(200).json({
				patient_statistics: patientStats,
				average_stay: avgStay,
				revenue_trends: revenue,
				admission_discharge: admissionDischarge,
				top_services: topServices,
				top_drugs: topDrugs,
				staff_utilization: staffUtil
			});
		} catch (error: any) {
			console.error("Error fetching comprehensive statistics:", error);
			res.status(500).json({
				error:
					error.message || "Failed to fetch comprehensive statistics"
			});
		}
	}

	/**
	 * Get patient statistics by gender with chart
	 */
	static async getPatientStatisticsByGender(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, grouping } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const timeGrouping = (grouping as TimeGrouping) || "day";

			// Get statistics and gender-specific data
			const statistics = await ReportModel.getPatientStatistics(
				dateRange,
				timeGrouping
			);
			const genderData = await ReportModel.getPatientStatisticsByGender(
				dateRange,
				timeGrouping
			);

			// Generate pie chart for gender distribution
			const pieChartData =
				ReportModel.generateGenderDistributionChart(statistics);

			res.status(200).json({
				data: genderData,
				summary: statistics,
				chartData: pieChartData,
				chartType: "pie"
			});
		} catch (error: any) {
			console.error("Error fetching gender statistics:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch gender statistics"
			});
		}
	}

	/**
	 * Get doctor statistics with chart
	 */
	static async getDoctorStatistics(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const statistics = await ReportModel.getDoctorStatistics(dateRange);
			const chartData =
				ReportModel.generateDoctorStatisticsChart(statistics);

			res.status(200).json({
				data: statistics,
				chartData: chartData,
				chartType: "bar"
			});
		} catch (error: any) {
			console.error("Error fetching doctor statistics:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch doctor statistics"
			});
		}
	}

	// ==================== EMPLOYEE PAYMENT REPORTS ====================

	/**
	 * Get employee payment reports
	 */
	static async getEmployeePaymentReports(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, employee_type, employee_id } =
				req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const employeeTypeFilter =
				(employee_type as EmployeeTypeFilter) || "all";
			const employeeIdNum = employee_id
				? parseInt(employee_id as string)
				: undefined;

			const reports = await ReportModel.getEmployeePaymentReport(
				dateRange,
				employeeTypeFilter,
				employeeIdNum
			);

			res.status(200).json(reports);
		} catch (error: any) {
			console.error("Error fetching employee payment reports:", error);
			res.status(500).json({
				error:
					error.message || "Failed to fetch employee payment reports"
			});
		}
	}

	/**
	 * Get employee payment reports with chart data
	 */
	static async getEmployeePaymentReportsWithChart(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const { start_date, end_date, employee_type, employee_id } =
				req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const employeeTypeFilter =
				(employee_type as EmployeeTypeFilter) || "all";
			const employeeIdNum = employee_id
				? parseInt(employee_id as string)
				: undefined;

			const reports = await ReportModel.getEmployeePaymentReport(
				dateRange,
				employeeTypeFilter,
				employeeIdNum
			);

			// Generate chart data
			const timeChartData =
				ReportModel.generateEmployeePaymentChart(reports);
			const typeChartData =
				ReportModel.generateEmployeePaymentTypeChart(reports);

			res.status(200).json({
				data: reports,
				timeChartData: timeChartData,
				typeChartData: typeChartData,
				chartTypes: {
					time: "line",
					type: "doughnut"
				}
			});
		} catch (error: any) {
			console.error(
				"Error fetching employee payment reports with chart:",
				error
			);
			res.status(500).json({
				error:
					error.message || "Failed to fetch employee payment reports"
			});
		}
	}

	/**
	 * Get specific employee payment report
	 */
	static async getEmployeePaymentReportById(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const employeeId = parseInt(req.params.employeeId);
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			const reports = await ReportModel.getEmployeePaymentReport(
				dateRange,
				"all",
				employeeId
			);

			if (reports.length === 0) {
				res.status(404).json({
					error: "Employee not found or no payments in date range"
				});
				return;
			}

			res.status(200).json(reports[0]);
		} catch (error: any) {
			console.error("Error fetching employee payment report:", error);
			res.status(500).json({
				error:
					error.message || "Failed to fetch employee payment report"
			});
		}
	}

	// ==================== SUMMARY REPORTS ====================

	/**
	 * Get comprehensive report summary
	 */
	static async getReportSummary(req: Request, res: Response): Promise<void> {
		try {
			const { start_date, end_date } = req.query;

			if (!start_date || !end_date) {
				res.status(400).json({
					error: "Start date and end date are required"
				});
				return;
			}

			const dateRange: ReportDateRange = {
				start_date: start_date as string,
				end_date: end_date as string
			};

			// Fetch all summary data in parallel
			const [patientStats, doctorStats, employeePaymentReports] =
				await Promise.all([
					ReportModel.getPatientStatistics(dateRange, "day"),
					ReportModel.getDoctorStatistics(dateRange),
					ReportModel.getEmployeePaymentReport(dateRange, "all")
				]);

			const summary = {
				period: {
					start_date: dateRange.start_date,
					end_date: dateRange.end_date
				},
				patients: {
					total: patientStats.total_patients,
					by_payment_type: patientStats.by_payment_type,
					by_gender: patientStats.by_gender,
					avg_stay_duration: patientStats.avg_stay_duration
				},
				doctors: {
					total_doctors: doctorStats.length,
					total_patients_attended: doctorStats.reduce(
						(sum, d) => sum + d.total_patients_attended,
						0
					),
					total_revenue_generated: doctorStats.reduce(
						(sum, d) => sum + d.total_revenue_generated,
						0
					)
				},
				employees: {
					total_employees: employeePaymentReports.length,
					total_payments: employeePaymentReports.reduce(
						(sum, r) => sum + r.payment_summary.total_payments,
						0
					),
					total_paid: employeePaymentReports.reduce(
						(sum, r) => sum + r.payment_summary.total_paid,
						0
					),
					total_unpaid: employeePaymentReports.reduce(
						(sum, r) => sum + r.payment_summary.total_unpaid,
						0
					)
				}
			};

			res.status(200).json(summary);
		} catch (error: any) {
			console.error("Error fetching report summary:", error);
			res.status(500).json({
				error: error.message || "Failed to fetch report summary"
			});
		}
	}
}
