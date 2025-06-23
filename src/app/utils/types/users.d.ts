export interface User {
	user_id: number;
	username: string;
	password_hash: string;
	role_id: number;
	created_at: Date;
}

export interface Role {
	role_id: number;
	name: string;
}

export interface Permission {
	permission_id: number;
	feature_name: string;
	description: string | null;
}

export interface CreatePermissionDTO {
	feature_name: string;
	description?: string;
}

export interface UpdatePermissionDTO {
	permission_id: number;
	feature_name?: string;
	description?: string | null;
}

export interface RolePermission {
	role_id: number;
	permission_id: number;
}

export interface AssignPermissionsDTO {
	role_id: number;
	permission_ids: number[];
}

export interface CreateUserDTO {
	username: string;
	password: string;
	role_id: number;
}

export interface UpdateUserDTO {
	user_id: number;
	username?: string;
	password?: string;
	role_id?: number;
}

export interface CreateRoleDTO {
	name: string;
	permissions: number[]; // Array of permission IDs
}

export interface UpdateRoleDTO {
	role_id: number;
	name?: string;
	permissions?: {
		add?: number[]; // Permission IDs to add
		remove?: number[]; // Permission IDs to remove
	};
}

export interface UserWithRole extends User {
	role_name: string;
}

export interface RoleWithPermissions extends Role {
	permissions: Permission[];
}
