export type PiboAuthIdentity = {
	userId: string;
	email?: string;
	name?: string;
	image?: string;
	provider?: string;
};

export type PiboAuthSession = {
	identity: PiboAuthIdentity;
	sessionId?: string;
	expiresAt?: Date;
};

export type PiboAuthService = {
	name: string;
	start?(): Promise<void> | void;
	stop?(): Promise<void> | void;
	getSession(headers: Headers): Promise<PiboAuthSession | undefined>;
	requireSession(headers: Headers): Promise<PiboAuthSession>;
	handleRequest?(request: Request): Promise<Response>;
};

export class PiboAuthError extends Error {
	constructor(
		message: string,
		readonly statusCode: number,
	) {
		super(message);
		this.name = "PiboAuthError";
	}
}

export function createUnauthenticatedError(): Error {
	return new PiboAuthError("Unauthenticated", 401);
}

export function createForbiddenAuthError(): Error {
	return new PiboAuthError("Forbidden", 403);
}
