import { createUnauthenticatedError, type PiboAuthSession } from "../auth/types.js";
import type { PiboChannelContext } from "../channels/types.js";
import type { PiboSessionBinding } from "../sessions/bindings.js";

export async function getWebAuthSession(
	context: PiboChannelContext,
	request: Request,
): Promise<PiboAuthSession | undefined> {
	return context.auth?.getSession(request.headers);
}

export async function requireWebSession(
	context: PiboChannelContext,
	request: Request,
	input: {
		channel: string;
		defaultProfile: string;
	},
): Promise<{ authSession: PiboAuthSession; binding: PiboSessionBinding }> {
	const authSession = await getWebAuthSession(context, request);
	if (!authSession) throw createUnauthenticatedError();

	const binding = context.resolveSession({
		channel: input.channel,
		externalId: authSession.identity.userId,
		defaultProfile: input.defaultProfile,
	});
	return { authSession, binding };
}
