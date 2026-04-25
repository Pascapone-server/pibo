import { createBetterAuthService, type BetterAuthServiceOptions } from "../auth/better-auth.js";
import { definePiboPlugin } from "./registry.js";

export function createPiboBetterAuthPlugin(options: BetterAuthServiceOptions = {}) {
	return definePiboPlugin({
		id: "pibo.better-auth",
		name: "Pibo Better Auth",
		register(api) {
			api.registerAuthService(createBetterAuthService(options));
		},
	});
}
