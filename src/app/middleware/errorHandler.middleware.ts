import { Request, Response, NextFunction } from "express";

export interface ApiError extends Error {
	statusCode?: number;
}

export const errorHandler = (
	err: ApiError,
	req: Request,
	res: Response,
	_next: NextFunction
) => {
	const statusCode = err.statusCode || 500;
	res.status(statusCode).json({
		error: err.message || "Internal Server Error",
		path: req.path
	});
};
