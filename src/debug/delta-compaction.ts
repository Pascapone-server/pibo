import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolveDebugStore } from "./stores.js";

const LIVE_ONLY_TYPES = ["assistant_delta", "thinking_delta", "tool_execution_updated"];

type CompactOptions = {
	apply?: boolean;
	store?: string;
	session?: string;
	json?: boolean;
};

type StoreResult = {
	store: string;
	path: string;
	exists: boolean;
	liveOnlyRows: number;
	byType: Array<{ type: string; count: number }>;
	plannedDeletes: number;
	deleted: number;
	status: "dry-run" | "applied" | "missing";
};

export function runDeltaCompaction(options: CompactOptions): { results: StoreResult[] } {
	const names = options.store ? [options.store] : ["chat", "reliability"];
	return { results: names.map((name) => inspectStore(name, options)) };
}

export function formatDeltaCompaction(result: { results: StoreResult[] }): string {
	return [
		"store\tpath\tstatus\tliveOnlyRows\tplannedDeletes\tdeleted\tbyType",
		...result.results.map((item) =>
			[
				item.store,
				item.path,
				item.status,
				item.liveOnlyRows,
				item.plannedDeletes,
				item.deleted,
				item.byType.map((row) => `${row.type}:${row.count}`).join(","),
			].join("\t"),
		),
	].join("\n");
}

function inspectStore(name: string, options: CompactOptions): StoreResult {
	const resolved = resolveDebugStore(name === "read-model" ? "chat" : name);
	if (!resolved.exists || !existsSync(resolved.path)) {
		return emptyResult(name, resolved.path, "missing");
	}
	const db = new DatabaseSync(resolved.path);
	try {
		if (name === "reliability") return inspectReliability(db, name, resolved.path, options);
		return inspectChat(db, name, resolved.path, options);
	} finally {
		db.close();
	}
}

function inspectChat(db: DatabaseSync, store: string, path: string, options: CompactOptions): StoreResult {
	const chatEvents = tableExists(db, "chat_events")
		? countRows(db, "chat_events", "event_type", "pibo_session_id", options.session)
		: [];
	const webEvents = tableExists(db, "web_chat_events")
		? countRows(db, "web_chat_events", "type", "pibo_session_id", options.session)
		: [];
	const byType = mergeCounts([...chatEvents, ...webEvents]);
	const liveOnlyRows = byType.reduce((sum, row) => sum + row.count, 0);
	let deleted = 0;
	if (options.apply && liveOnlyRows > 0) {
		db.exec(auditTableSql());
		if (tableExists(db, "chat_events")) deleted += deleteRows(db, "chat_events", "event_type", "pibo_session_id", options.session);
		if (tableExists(db, "web_chat_events")) deleted += deleteRows(db, "web_chat_events", "type", "pibo_session_id", options.session);
	}
	return { store, path, exists: true, liveOnlyRows, byType, plannedDeletes: liveOnlyRows, deleted, status: options.apply ? "applied" : "dry-run" };
}

function inspectReliability(db: DatabaseSync, store: string, path: string, options: CompactOptions): StoreResult {
	if (!tableExists(db, "pibo_event_stream")) return emptyResult(store, path, options.apply ? "applied" : "dry-run");
	const clauses = ["topic = 'pibo.output'", liveOnlyPredicate("json_extract(payload_json, '$.type')")];
	const values: string[] = [];
	if (options.session) {
		clauses.push("key = ?");
		values.push(options.session);
	}
	const byType = (db
		.prepare(
			`SELECT json_extract(payload_json, '$.type') AS type, COUNT(*) AS count FROM pibo_event_stream WHERE ${clauses.join(" AND ")} GROUP BY type ORDER BY type`,
		)
		.all(...values) as Array<{ type: string; count: number }>).map((row) => ({ type: row.type, count: Number(row.count) }));
	const liveOnlyRows = byType.reduce((sum, row) => sum + row.count, 0);
	let deleted = 0;
	if (options.apply && liveOnlyRows > 0) {
		const result = db.prepare(`DELETE FROM pibo_event_stream WHERE ${clauses.join(" AND ")}`).run(...values);
		deleted = Number(result.changes ?? 0);
	}
	return { store, path, exists: true, liveOnlyRows, byType, plannedDeletes: liveOnlyRows, deleted, status: options.apply ? "applied" : "dry-run" };
}

function countRows(db: DatabaseSync, table: string, typeColumn: string, sessionColumn: string, session?: string): Array<{ type: string; count: number }> {
	const clauses = [liveOnlyPredicate(typeColumn)];
	const values: string[] = [];
	if (session) {
		clauses.push(`${sessionColumn} = ?`);
		values.push(session);
	}
	return (db
		.prepare(`SELECT ${typeColumn} AS type, COUNT(*) AS count FROM ${table} WHERE ${clauses.join(" AND ")} GROUP BY ${typeColumn} ORDER BY ${typeColumn}`)
		.all(...values) as Array<{ type: string; count: number }>).map((row) => ({ type: row.type, count: Number(row.count) }));
}

function deleteRows(db: DatabaseSync, table: string, typeColumn: string, sessionColumn: string, session?: string): number {
	const clauses = [liveOnlyPredicate(typeColumn)];
	const values: string[] = [];
	if (session) {
		clauses.push(`${sessionColumn} = ?`);
		values.push(session);
	}
	const result = db.prepare(`DELETE FROM ${table} WHERE ${clauses.join(" AND ")}`).run(...values);
	return Number(result.changes ?? 0);
}

function liveOnlyPredicate(column: string): string {
	return `${column} IN (${LIVE_ONLY_TYPES.map((type) => `'${type}'`).join(", ")})`;
}

function mergeCounts(rows: Array<{ type: string; count: number }>): Array<{ type: string; count: number }> {
	const counts = new Map<string, number>();
	for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + row.count);
	return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => a.type.localeCompare(b.type));
}

function tableExists(db: DatabaseSync, table: string): boolean {
	const row = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { found: number } | undefined;
	return Boolean(row);
}

function emptyResult(store: string, path: string, status: StoreResult["status"]): StoreResult {
	return { store, path, exists: status !== "missing", liveOnlyRows: 0, byType: [], plannedDeletes: 0, deleted: 0, status };
}

function auditTableSql(): string {
	return `CREATE TABLE IF NOT EXISTS chat_event_compactions (
		id TEXT PRIMARY KEY,
		store TEXT NOT NULL,
		pibo_session_id TEXT,
		event_id TEXT,
		group_key TEXT NOT NULL,
		old_event_types_json TEXT NOT NULL,
		old_row_count INTEGER NOT NULL,
		old_first_order INTEGER,
		old_last_order INTEGER,
		new_event_type TEXT,
		new_order INTEGER,
		status TEXT NOT NULL,
		created_at TEXT NOT NULL,
		details_json TEXT NOT NULL
	)`;
}
