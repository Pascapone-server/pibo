import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PiboOutputEvent } from "../../core/events.js";
import type { PiboSessionBinding } from "../../sessions/bindings.js";

type SessionRow = {
	session_key: string;
	session_id: string;
	parent_session_key: string | null;
	profile: string;
	channel: string;
	created_at: string;
	updated_at: string;
	last_activity_at: string | null;
	status: string;
};

type EventRow = {
	id: string;
	session_key: string;
	event_id: string | null;
	type: string;
	created_at: string;
	payload_json: string;
};

export type ChatWebStoredEvent = {
	id: string;
	sessionKey: string;
	eventId?: string;
	type: string;
	createdAt: string;
	payload: PiboOutputEvent;
};

export type ChatWebSessionIndexItem = {
	sessionKey: string;
	sessionId: string;
	parentSessionKey?: string;
	profile: string;
	channel: string;
	createdAt: string;
	updatedAt: string;
	lastActivityAt?: string;
	status: "idle" | "running" | "error";
};

export class ChatWebReadModel {
	private readonly db: DatabaseSync;

	constructor(path: string) {
		const resolvedPath = path === ":memory:" ? path : resolve(path);
		if (resolvedPath !== ":memory:") {
			mkdirSync(dirname(resolvedPath), { recursive: true });
		}

		this.db = new DatabaseSync(resolvedPath);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS web_chat_sessions (
				session_key TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				parent_session_key TEXT,
				profile TEXT NOT NULL,
				channel TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				last_activity_at TEXT,
				status TEXT NOT NULL DEFAULT 'idle'
			);

			CREATE TABLE IF NOT EXISTS web_chat_events (
				id TEXT PRIMARY KEY,
				session_key TEXT NOT NULL,
				event_id TEXT,
				type TEXT NOT NULL,
				created_at TEXT NOT NULL,
				payload_json TEXT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_web_chat_events_session_created
				ON web_chat_events(session_key, created_at, id);
			CREATE INDEX IF NOT EXISTS idx_web_chat_events_event_id
				ON web_chat_events(event_id);
			CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_parent
				ON web_chat_sessions(parent_session_key);
		`);
	}

	upsertSession(binding: PiboSessionBinding, status: ChatWebSessionIndexItem["status"] = "idle"): void {
		const profile = binding.currentProfile ?? binding.originalProfile;
		this.db
			.prepare(`
				INSERT INTO web_chat_sessions (
					session_key,
					session_id,
					parent_session_key,
					profile,
					channel,
					created_at,
					updated_at,
					last_activity_at,
					status
				) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
				ON CONFLICT(session_key) DO UPDATE SET
					session_id = excluded.session_id,
					parent_session_key = excluded.parent_session_key,
					profile = excluded.profile,
					channel = excluded.channel,
					updated_at = excluded.updated_at,
					status = CASE
						WHEN web_chat_sessions.status = 'running' AND excluded.status = 'idle' THEN web_chat_sessions.status
						ELSE excluded.status
					END
			`)
			.run(
				binding.sessionKey,
				binding.sessionId ?? binding.sessionKey,
				binding.parentSessionKey ?? null,
				profile,
				binding.channel,
				binding.createdAt,
				binding.updatedAt,
				status,
			);
	}

	recordEvent(event: PiboOutputEvent, binding?: PiboSessionBinding): ChatWebStoredEvent {
		if (binding) this.upsertSession(binding, statusFromEvent(event));

		const id = randomUUID();
		const createdAt = new Date().toISOString();
		const eventId = "eventId" in event && typeof event.eventId === "string" ? event.eventId : undefined;
		this.db
			.prepare(
				"INSERT INTO web_chat_events (id, session_key, event_id, type, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(id, event.sessionKey, eventId ?? null, event.type, createdAt, JSON.stringify(event));
		this.db
			.prepare(
				"UPDATE web_chat_sessions SET last_activity_at = ?, status = ?, updated_at = ? WHERE session_key = ?",
			)
			.run(createdAt, statusFromEvent(event), createdAt, event.sessionKey);

		return { id, sessionKey: event.sessionKey, eventId, type: event.type, createdAt, payload: event };
	}

	listSessions(): ChatWebSessionIndexItem[] {
		return (this.db.prepare("SELECT * FROM web_chat_sessions ORDER BY updated_at DESC").all() as SessionRow[]).map(
			sessionFromRow,
		);
	}

	listEvents(sessionKey: string, limit = 1000): ChatWebStoredEvent[] {
		const rows = this.db
			.prepare(
				"SELECT * FROM web_chat_events WHERE session_key = ? ORDER BY created_at ASC, id ASC LIMIT ?",
			)
			.all(sessionKey, limit) as EventRow[];
		return rows.map(eventFromRow);
	}

	close(): void {
		this.db.close();
	}
}

export function createDefaultChatWebReadModel(cwd = process.cwd()): ChatWebReadModel {
	return new ChatWebReadModel(resolve(cwd, ".pibo/web-chat.sqlite"));
}

function statusFromEvent(event: PiboOutputEvent): ChatWebSessionIndexItem["status"] {
	if (event.type === "session_error") return "error";
	if (
		event.type === "message_started" ||
		event.type === "assistant_delta" ||
		event.type === "thinking_started" ||
		event.type === "thinking_delta" ||
		event.type === "tool_execution_started" ||
		event.type === "tool_execution_updated"
	) {
		return "running";
	}
	return "idle";
}

function sessionFromRow(row: SessionRow): ChatWebSessionIndexItem {
	return {
		sessionKey: row.session_key,
		sessionId: row.session_id,
		parentSessionKey: row.parent_session_key ?? undefined,
		profile: row.profile,
		channel: row.channel,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		lastActivityAt: row.last_activity_at ?? undefined,
		status: row.status === "running" || row.status === "error" ? row.status : "idle",
	};
}

function eventFromRow(row: EventRow): ChatWebStoredEvent {
	return {
		id: row.id,
		sessionKey: row.session_key,
		eventId: row.event_id ?? undefined,
		type: row.type,
		createdAt: row.created_at,
		payload: JSON.parse(row.payload_json) as PiboOutputEvent,
	};
}
