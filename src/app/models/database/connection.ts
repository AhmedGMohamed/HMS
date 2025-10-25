import pg from "pg";
const { Pool } = pg;
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
	path: path.join(__dirname, "../../.env")
});

let pool: pg.Pool;

export const pgPool = new pg.Pool({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	password: process.env.DB_PASSWORD,
	port: parseInt(process.env.DB_PORT || "5432")
})

switch (process.env.NODE_ENV) {
	case "test":
		pool = new Pool({
			user: process.env.DB_USER_TEST,
			host: process.env.DB_HOST_TEST,
			database: process.env.DB_NAME_TEST,
			password: process.env.DB_PASSWORD_TEST,
			port: parseInt(process.env.DB_PORT_TEST || "5432")
		});
		break;

	default:
		pool = new Pool({
			user: process.env.DB_USER,
			host: process.env.DB_HOST,
			database: process.env.DB_NAME,
			password: process.env.DB_PASSWORD,
			port: parseInt(process.env.DB_PORT || "5432")
		});
}

export const query = async (text: string, params?: any[]) => {
	try {
		const parameters = params || [];
		const result = await pool.query(text, parameters);
		return result;
	} catch (error: any) {
		console.error("Database Error:", { error, text, params, stack: error.stack });
		throw error;
	}
};

export default pool ;
