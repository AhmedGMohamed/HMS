import { dbHelper } from "./dist-electron/app/tests/helpers/db.helper.js";
await dbHelper.createDBIfNotExists(process.env.DB_NAME_TEST);
process.exit(0);
