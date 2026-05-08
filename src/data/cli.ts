import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { piboHomePath } from "../core/pibo-home.js";

type StoreInventory = {
	name: string;
	path: string;
	exists: boolean;
	bytes: number;
	walBytes: number;
	integrity?: string;
	tables: Record<string, number>;
	freelistPages?: number;
	pageCount?: number;
	pageSize?: number;
};

const INVENTORY_STORES = [
	{ name: "v2", file: "pibo.sqlite", tables: ["sessions", "rooms", "chat_messages", "event_log", "observations", "payloads", "session_navigation"] },
	{ name: "v2-shadow", file: "pibo-chat-v2.sqlite", tables: ["sessions", "rooms", "chat_messages", "event_log", "observations", "payloads", "session_navigation"] },
	{ name: "sessions", file: "pibo-sessions.sqlite", tables: ["pibo_sessions"] },
	{ name: "chat", file: "web-chat.sqlite", tables: ["chat_events", "web_chat_events", "web_chat_sessions", "pibo_rooms", "chat_session_reads"] },
	{ name: "reliability", file: "pibo-events.sqlite", tables: ["pibo_event_stream", "pibo_jobs", "pibo_runs"] },
	{ name: "auth", file: "auth.sqlite", tables: [] },
];

export async function runDataCli(argv: string[]): Promise<void> {
	const args = argv.slice(2);
	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		printDataHelp();
		return;
	}
	if (args[0] === "inventory") {
		const json = args.includes("--json");
		const root = optionValue(args, "--root") ?? process.env.PIBO_HOME;
		const inventory = collectInventory(root);
		if (json) console.log(JSON.stringify({ stores: inventory }, null, 2));
		else printInventory(inventory);
		return;
	}
	throw new Error(`Unknown pibo data command "${args[0]}". Run pibo data --help.`);
}

function collectInventory(root?: string): StoreInventory[] {
	return INVENTORY_STORES.map((store) => inventoryStore(store.name, store.file, store.tables, root));
}

function inventoryStore(name: string, file: string, expectedTables: string[], root?: string): StoreInventory {
	const path = root ? resolve(root, file) : piboHomePath(file);
	const exists = existsSync(path);
	const result: StoreInventory = {
		name,
		path,
		exists,
		bytes: exists ? statSync(path).size : 0,
		walBytes: existsSync(`${path}-wal`) ? statSync(`${path}-wal`).size : 0,
		tables: {},
	};
	if (!exists) return result;
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		result.integrity = String((db.prepare("PRAGMA integrity_check").get() as Record<string, unknown> | undefined)?.integrity_check ?? "unknown");
		result.freelistPages = Number((db.prepare("PRAGMA freelist_count").get() as Record<string, unknown> | undefined)?.freelist_count ?? 0);
		result.pageCount = Number((db.prepare("PRAGMA page_count").get() as Record<string, unknown> | undefined)?.page_count ?? 0);
		result.pageSize = Number((db.prepare("PRAGMA page_size").get() as Record<string, unknown> | undefined)?.page_size ?? 0);
		const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name));
		for (const table of expectedTables) {
			if (!tables.has(table)) continue;
			result.tables[table] = Number((db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get() as Record<string, unknown>).count ?? 0);
		}
	} finally {
		db.close();
	}
	return result;
}

function quoteIdent(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

function optionValue(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) return undefined;
	return args[index + 1];
}

function printInventory(stores: StoreInventory[]): void {
	console.log("store\texists\tbytes\twalBytes\tintegrity\ttables\tpath");
	for (const store of stores) {
		const tables = Object.entries(store.tables).map(([name, count]) => `${name}:${count}`).join(",") || "-";
		console.log(`${store.name}\t${store.exists}\t${store.bytes}\t${store.walBytes}\t${store.integrity ?? "-"}\t${tables}\t${store.path}`);
	}
}

function printDataHelp(): void {
	console.log(`pibo data - inspect and maintain Pibo data stores

Commands:
  inventory  Read-only row counts, sizes, WAL sizes, and integrity checks

Options:
  --json     Print machine-readable JSON
  --root DIR Inspect a specific Pibo home directory instead of ~/.pibo

Next:
  pibo data inventory --json
`);
}
