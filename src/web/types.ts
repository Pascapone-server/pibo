import type { PiboChannelContext } from "../channels/types.js";
import type { PiboAuthSession } from "../auth/types.js";
import type { PiboSessionBinding } from "../sessions/bindings.js";

export type PiboWebSession = {
	authSession: PiboAuthSession;
	binding: PiboSessionBinding;
};

export type PiboWebAppContext = {
	channelContext: PiboChannelContext;
	requireSession(input: {
		request: Request;
		channel: string;
		defaultProfile: string;
	}): Promise<PiboWebSession>;
};

export type PiboWebApp = {
	name: string;
	mountPath: string;
	apiPrefix: string;
	handleRequest(request: Request, context: PiboWebAppContext): Promise<Response | undefined> | Response | undefined;
};
