import { createUnauthenticatedError, type PiboAuthSession } from "../auth/types.js";
import type { PiboChannelContext } from "../channels/types.js";

export async function getWebAuthSession(
	context: PiboChannelContext,
	request: Request,
): Promise<PiboAuthSession | undefined> {
	return context.auth?.getSession(request.headers);
}

export async function requireWebSession(
	context: PiboChannelContext,
	request: Request,
): Promise<{ authSession: PiboAuthSession; ownerScope: string }> {
	const authSession = await getWebAuthSession(context, request);
	if (!authSession) throw createUnauthenticatedError();

	return { authSession, ownerScope: `user:${authSession.identity.userId}` };
}
