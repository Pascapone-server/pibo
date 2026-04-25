import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer } from "better-auth/plugins";
import type { PiboAuthService, PiboAuthSession } from "./types.js";
import { createForbiddenAuthError, createUnauthenticatedError } from "./types.js";

export type BetterAuthServiceOptions = {
	baseURL?: string;
	databasePath?: string;
	secret?: string;
	googleClientId?: string;
	googleClientSecret?: string;
	trustedOrigins?: string[];
	allowedEmails?: string[];
};

function requiredOption(value: string | undefined, name: string): string {
	if (!value) throw new Error(`${name} is required for pibo Better Auth`);
	return value;
}

function requiredSecret(value: string | undefined): string {
	const secret = requiredOption(value, "BETTER_AUTH_SECRET");
	if (secret.length < 32) {
		throw new Error("BETTER_AUTH_SECRET must be at least 32 characters for pibo Better Auth");
	}
	return secret;
}

function createAllowedEmailSet(emails: string[]): Set<string> {
	return new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function createDatabase(path: string): DatabaseSync {
	const resolvedPath = path === ":memory:" ? path : resolve(path);
	if (resolvedPath !== ":memory:") {
		mkdirSync(dirname(resolvedPath), { recursive: true });
	}
	return new DatabaseSync(resolvedPath);
}

function parseAllowedEmails(value: string | undefined): Set<string> | undefined {
	const emails = (value ?? "").split(",");
	const allowedEmails = createAllowedEmailSet(emails);
	return allowedEmails.size > 0 ? allowedEmails : undefined;
}

function requiredAllowedEmails(options: BetterAuthServiceOptions): Set<string> {
	const allowedEmails =
		options.allowedEmails !== undefined
			? createAllowedEmailSet(options.allowedEmails)
			: parseAllowedEmails(process.env.PIBO_AUTH_ALLOWED_EMAILS);
	if (!allowedEmails || allowedEmails.size === 0) {
		throw new Error("PIBO_AUTH_ALLOWED_EMAILS must contain at least one email for pibo Better Auth");
	}
	return allowedEmails;
}

export function createBetterAuthService(options: BetterAuthServiceOptions = {}): PiboAuthService {
	const baseURL = requiredOption(options.baseURL ?? process.env.BETTER_AUTH_URL, "BETTER_AUTH_URL");
	const secret = requiredSecret(options.secret ?? process.env.BETTER_AUTH_SECRET);
	const googleClientId = requiredOption(options.googleClientId ?? process.env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID");
	const googleClientSecret = requiredOption(
		options.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
		"GOOGLE_CLIENT_SECRET",
	);
	const allowedEmails = requiredAllowedEmails(options);
	const database = createDatabase(options.databasePath ?? ".pibo/auth.sqlite");
	const authOptions: BetterAuthOptions = {
		appName: "Pibo",
		baseURL,
		secret,
		database,
		trustedOrigins: options.trustedOrigins ?? [baseURL],
		socialProviders: {
			google: {
				clientId: googleClientId,
				clientSecret: googleClientSecret,
				prompt: "select_account",
			},
		},
		plugins: [bearer()],
	};
	const auth = betterAuth(authOptions);

	return {
		name: "better-auth",
		async start() {
			const migrations = await getMigrations(authOptions);
			await migrations.runMigrations();
		},
		stop() {
			database.close();
		},
		async getSession(headers) {
			const session = await auth.api.getSession({ headers });
			if (!session) return undefined;

			const user = session.user;
				if (!allowedEmails.has(user.email.toLowerCase())) {
				throw createForbiddenAuthError();
			}

			const authSession = session.session;
			const mapped: PiboAuthSession = {
				identity: {
					userId: user.id,
					email: user.email,
					name: user.name,
					image: user.image ?? undefined,
					provider: "google",
				},
				sessionId: authSession.id,
				expiresAt: authSession.expiresAt,
			};
			return mapped;
		},
		async requireSession(headers) {
			const session = await this.getSession(headers);
			if (!session) throw createUnauthenticatedError();
			return session;
		},
		handleRequest(request) {
			return auth.handler(request);
		},
	};
}
