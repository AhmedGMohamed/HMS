import { Request, Response, NextFunction } from "express";

export const validateId = (req: Request, res: Response, next: NextFunction) => {
	const id = parseInt(req.params.id);
	if (isNaN(id)) {
		res.status(400).json({ error: "Invalid ID parameter" });
		return;
	}
	req.params.id = id.toString();
	next();
};

export const validateHistoryId = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const historyId = parseInt(req.params.historyId);
	if (isNaN(historyId) || historyId <= 0) {
		res.status(400).json({ error: "Valid history ID is required" });
		return;
	}
	next();
};

export const validateSearchTerm = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const searchTerm = req.query.q as string;
	if (!searchTerm || searchTerm.trim().length === 0) {
		res.status(400).json({ error: "Search term is required" });
		return
	}
	next();
};

export const validatePrefix = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const prefix = req.query.prefix as string;
	if (!prefix || prefix.trim().length === 0) {
		res.status(400).json({ error: "Prefix is required" });
		return
	}
	next();
};
