import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import { createDBIfNotExists, ensureAdminSchema } from "./utils/setUpDatabase.js";
import apiRoutes from "./routes/api.routes.js";
import dotenv from "dotenv";
import overridePgDate from "./utils/pgDateOverride.js";
import EmployeePaymentCron from "./cron/employeePaymentCron.js";
import PatientAutoRenewalCron from "./cron/patientAutoRenewalCron.js";
import { Request, Response } from "express";

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

overridePgDate();
dotenv.config({
	path: path.join(__dirname, ".env")
});

await createDBIfNotExists(process.env.DB_NAME as string || "HMS");
await ensureAdminSchema();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const rendererDist = path.join(__dirname, "renderer");

// The built React SPA owns `/` and every non-API path. `index: false`
// keeps the root request flowing to the history fallback below.
app.use(express.static(rendererDist, { index: false }));

const healthHandler = (_req: Request, res: Response): void => {
	res.status(200).json({
		status: "ok",
		timestamp: new Date().toISOString(),
		service: "Hospital Management System",
		version: "0.4.04"
	});
};

app.get("/health", healthHandler);
// Electron's `testServerConnection` probes `/api/health`; keep it in
// lockstep with the public health endpoint.
app.get("/api/health", healthHandler);

// API routes
app.use("/api", apiRoutes);

// Never let an unknown API path fall through to the SPA shell.
app.use("/api", (_req, res) => {
	res.status(404).json({ error: "Not found" });
});

// React Router owns the client-side routes (Express 5 syntax).
app.get("/{*splat}", (_req, res) => {
	res.sendFile(path.join(rendererDist, "index.html"));
});

//app.use(errorHandler);

try {
	PatientAutoRenewalCron.start();
	EmployeePaymentCron.start();
} catch (error) {
	console.error("Error starting cron jobs: ", error);
}

app.listen(process.env.PORT, () => {
	console.log(`Server started on port ${process.env.PORT}`);
});
