import type { PiboJsonObject } from "../../core/events.js";
import type { PiboSession } from "../../sessions/store.js";

const CHAT_WEB_ARCHIVED_AT_KEY = "chatWebArchivedAt";

export function isChatWebSessionArchived(session: Pick<PiboSession, "metadata">): boolean {
	return typeof session.metadata?.[CHAT_WEB_ARCHIVED_AT_KEY] === "string";
}

export function withChatWebArchived(metadata: PiboJsonObject | undefined, archived: boolean): PiboJsonObject {
	const next: PiboJsonObject = { ...(metadata ?? {}) };
	if (archived) {
		next[CHAT_WEB_ARCHIVED_AT_KEY] = new Date().toISOString();
	} else {
		delete next[CHAT_WEB_ARCHIVED_AT_KEY];
	}
	return next;
}
