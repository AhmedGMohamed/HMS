// src/app/controllers/User.controller.ts
import { Request, Response } from "express";
import UserModel from "../models/User.model.js";
import { CreateUserDTO, UpdateUserDTO } from "../utils/types/users.js";

export class UserController {
	async createUser(req: Request, res: Response) {
		try {
			const userData: CreateUserDTO = req.body;

			if (!userData.username || !userData.password || !userData.role_id) {
				return res.status(400).json({
					error: "Username, password, and role_id are required"
				});
			}

			const newUser = await UserModel.createUser(userData);
			res.status(201).json(newUser);
		} catch (error: any) {
			if (error.message === "Username already exists") {
				res.status(409).json({ error: error.message });
			} else if (error.message === "Invalid role_id") {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error creating user:", error);
				res.status(500).json({ error: "Failed to create user" });
			}
		}
	}

	async updateUser(req: Request, res: Response) {
		try {
			const userId = parseInt(req.params.id);
			const userData: UpdateUserDTO = { ...req.body, user_id: userId };

			const updatedUser = await UserModel.updateUser(userData);
			res.json(updatedUser);
		} catch (error: any) {
			switch (error.message)
			{
				case "Username already exists":
					res.status(409).json({ error: error.message });
					break;
				case "Invalid role_id":
					res.status(400).json({ error: error.message });
					break;
				case "User not found":
					res.status(404).json({ error: error.message });
					break;
				case "No updates provided":
					res.status(400).json({ error: error.message });
					break;
				default:
					console.error("Error updating user:", error);
					res.status(500).json({ error: "Failed to update user" });
					break;
			}
		}
	}

	async deleteUser(req: Request, res: Response) {
		try {
			const userId = parseInt(req.params.id);
			await UserModel.deleteUser(userId);
			res.status(204).json({message: "Successfully deleted user"});
		} catch (error: any) {
			if (error.message === "User not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error deleting user:", error);
				res.status(500).json({ error: "Failed to delete user" });
			}
		}
	}

	async getUserById(req: Request, res: Response) {
		try {
			const userId = parseInt(req.params.id);
			const user = await UserModel.getUserById(userId);

			if (!user) {
				return res.status(404).json({ error: "User not found" });
			}

			res.json(user);
		} catch (error) {
			console.error("Error fetching user:", error);
			res.status(500).json({ error: "Failed to fetch user" });
		}
	}

	async getAllUsers(_req: Request, res: Response) {
		try {
			const users = await UserModel.getAllUsers();
			res.json(users);
		} catch (error) {
			console.error("Error fetching users:", error);
			res.status(500).json({ error: "Failed to fetch users" });
		}
	}
}

export default new UserController();
