// src/app/utils/types/express/index.d.ts
import { User, Permission } from "../users";

declare global {
	namespace Express {
		interface Request {
			user?: {
				userId: number;
				username: string;
				role: string;
				permissions: string[];
			};
		}
	}
}
