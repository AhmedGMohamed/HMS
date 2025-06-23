import { dbHelper } from "../../app/tests/helpers/db.helper.js";
import { isDev } from "./isDev.js";

export const devDatabase = {
	async seedDatabase() {
		if (isDev()) {
			await dbHelper.clearDatabase();
			await dbHelper.seedDatabase();
		} else {
			try {
				await dbHelper.createDBIfNotExists("HMS");
				if (!(await dbHelper.getUsers()).length) {
					try {
						await dbHelper.seedDatabase();
					} catch (error) {
						console.error("coulde be normal: ", error);
					}
				}
			} catch (error) {
				if (!(await dbHelper.getUsers()).length) {
					try {
						await dbHelper.seedDatabase();
					} catch (error) {
						console.error("coulde be normal: ", error);
					}
				}
			}
		}
	},
	async clearDatabase() {
		if (isDev()) {
			await dbHelper.clearDatabase();
		}
	}
};
