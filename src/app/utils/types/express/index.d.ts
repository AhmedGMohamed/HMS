// src/app/utils/types/express/index.d.ts
// Module marker: keeps `declare global` augmentation valid without the
// unused type imports it previously carried.
export {};

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
