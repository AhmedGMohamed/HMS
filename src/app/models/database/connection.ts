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

export const query = async (text: string, params?: unknown[]) => {
	try {
		const parameters = params || [];
		const result = await pool.query(text, parameters);
		return result;
	} catch (error: any) {
		console.error("Database Error:", { error, text, params, stack: error.stack });
		throw error;
	}
};

/**
 * Runs `fn` inside a real transaction on a single dedicated client.
 *
 * Do NOT emulate this with `query("BEGIN")`: `query()` pulls a client from
 * the pool per call, so BEGIN/COMMIT can land on different connections. The
 * BEGIN then never commits (leaking an open transaction and its locks) and
 * the COMMIT warns "no transaction in progress". Every statement inside `fn`
 * must therefore go through the supplied `client`, never through `query()`.
 *
 * Note: this uses the module-level `pool` (the NODE_ENV-switched pool that
 * owns the database), NOT `pgPool`. `pgPool` is deliberately constructed
 * without a `database` field so `createDBIfNotExists` can connect DB-less.
 */
export async function withTransaction<T>(
	fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await fn(client);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		try {
			await client.query("ROLLBACK");
		} catch {
			// The connection is already dead; nothing left to roll back.
		}
		throw error;
	} finally {
		client.release();
	}
}

export default pool ;
