import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import apiRoutes from "./routes/api.routes.js";
import pageRoutes from "./routes/page.routes.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";
import dotenv from "dotenv";
import overridePgDate from "./utils/pgDateOverride.js";
import { EmployeePaymentCron } from "./cron/employeePaymentCron.js";

overridePgDate();
dotenv.config()

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

const app = express();

app.use(express.urlencoded({extended: true}))
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "assets")));
app.use("/css", express.static(path.join(__dirname, "views/css")))
app.use("/js", express.static(path.join(__dirname, "views/js")))

// API routes
app.use("/api", apiRoutes);

// Page routes
app.use("/", pageRoutes);

app.get("/", (_req, res) => {
	res.sendFile("./views/login.html", { root: __dirname });
});

app.use((_req, res) => {
	res.status(404).sendFile("./views/404.html", { root: __dirname });
});

app.use(errorHandler);

EmployeePaymentCron.startJobs();

export default app;
