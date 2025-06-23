export interface AuditLog {
	log_id: number;
	user_id: number;
	action_type: string;
	details: {
		url: string;
		params: Record<string, string | number>;
		query: Record<string, string | number>;
		body: Record<string, string | number>;
		description: string;
	};
	timestamp: string;
}

export interface CreateAuditLogDTO {
	user_id: string | number;
	action_type: string;
	details: {
		url: string;
		params?: Record<string, string | number>;
		query?: Record<string, string | number>;
		body?: Record<string, string | number>;
		description: string;
	};
}

export interface UpdateAuditLogDTO {
	log_id: number;
	user_id?: number;
	action_type?: string;
	details?: {
		url: string;
		params?: Record<string, string | number>;
		query?: Record<string, string | number>;
		body?: Record<string, string | number>;
		description: string;
	};
}

export interface AuditLogWithUsername extends AuditLog {
	username: string;
}

