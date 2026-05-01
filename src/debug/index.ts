import { resolveDebugStore, resolveDebugStores } from "./stores.js";

type ParsedOptions = {
	positionals: string[];
	json: boolean;
	events: boolean;
	limit?: string;
};

export async function runDebugCli(argv = process.argv): Promise<void> {
	try {
		const args = argv.slice(2);
		if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
			printDebugDiscovery();
			return;
		}
		if (args[0] === "db") {
			await runDebugDb(args.slice(1));
			return;
		}
		if (args[0] === "session") {
			await runDebugSession(args.slice(1));
			return;
		}
		throw new Error(`Unknown pibo debug command "${args[0]}". Run pibo debug --help.`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

async function runDebugDb(args: string[]): Promise<void> {
	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		printDebugDbDiscovery();
		return;
	}
	const command = args[0];
	const options = parseOptions(args.slice(1));
	if (command === "stores") {
		const stores = resolveDebugStores();
		if (options.json) {
			console.log(JSON.stringify({ stores }, null, 2));
			return;
		}
		console.log(["store\tpath\texists\tdescription", ...stores.map((store) => `${store.name}\t${store.defaultPath}\t${store.exists}\t${store.description}`)].join("\n"));
		return;
	}
	const storeName = options.positionals[0];
	if (!storeName) throw new Error(`pibo debug db ${command} requires <store>`);
	const store = resolveDebugStore(storeName);
	if (command === "tables") {
		const { formatJson, listTables } = await import("./sql.js");
		const tables = listTables(store);
		if (options.json) console.log(formatJson({ store: store.name, path: store.path, tables }));
		else console.log(tables.length ? tables.join("\n") : "tables: 0");
		return;
	}
	if (command === "schema") {
		const { formatJson, getStoreSchema } = await import("./sql.js");
		const tables = getStoreSchema(store);
		if (options.json) {
			console.log(formatJson({ store: store.name, path: store.path, tables }));
			return;
		}
		console.log(formatSchemaText(tables));
		return;
	}
	if (command === "query") {
		const { formatJson, formatRows, runReadOnlyQuery } = await import("./sql.js");
		const sql = options.positionals.slice(1).join(" ");
		const result = runReadOnlyQuery(store, sql, { limit: options.limit });
		if (options.json) console.log(formatJson(result));
		else console.log(formatRows(result.rows, { limited: result.limited }));
		return;
	}
	throw new Error(`Unknown pibo debug db command "${command}". Run pibo debug db --help.`);
}

async function runDebugSession(args: string[]): Promise<void> {
	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		printDebugSessionDiscovery();
		return;
	}
	const options = parseOptions(args);
	const input = options.positionals[0];
	if (!input) throw new Error("pibo debug session requires <url-or-pibo-session-id>");
	const { formatJson } = await import("./sql.js");
	const { formatDebugSessionSummary, inspectDebugSession } = await import("./session.js");
	const summary = inspectDebugSession(input, {
		sessions: resolveDebugStore("sessions"),
		chat: resolveDebugStore("chat"),
	}, {
		events: options.events,
		limit: options.limit,
	});
	if (options.json) console.log(formatJson(summary));
	else console.log(formatDebugSessionSummary(summary));
}

function parseOptions(args: string[]): ParsedOptions {
	const parsed: ParsedOptions = { positionals: [], json: false, events: false };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") {
			parsed.json = true;
			continue;
		}
		if (arg === "--events") {
			parsed.events = true;
			continue;
		}
		if (arg === "--children") {
			continue;
		}
		if (arg === "--limit") {
			const value = args[index + 1];
			if (!value) throw new Error("--limit requires a value");
			parsed.limit = value;
			index += 1;
			continue;
		}
		parsed.positionals.push(arg);
	}
	return parsed;
}

function printDebugDiscovery(): void {
	console.log(`pibo debug - inspect local Pibo data

Commands:
  db       Inspect and query local SQLite stores
  session  Inspect one Pibo Session by id or Chat URL

Next:
  pibo debug db
  pibo debug session <url-or-pibo-session-id>
`);
}

function printDebugDbDiscovery(): void {
	console.log(`pibo debug db - inspect local SQLite stores

Stores:
  sessions  .pibo/pibo-sessions.sqlite
  chat      .pibo/web-chat.sqlite
  agents    .pibo/chat-agents.sqlite
  auth      .pibo/auth.sqlite
  bindings  .pibo/session-bindings.sqlite

Commands:
  stores               List known stores and paths
  tables <store>       List tables only
  schema <store>       List tables and columns
  query <store> <sql>  Run read-only SQL

Next:
  pibo debug db schema sessions
  pibo debug db query sessions "select id, profile from pibo_sessions limit 5"
`);
}

function printDebugSessionDiscovery(): void {
	console.log(`pibo debug session - inspect one Pibo Session

Usage:
  pibo debug session <url-or-pibo-session-id> [--events] [--limit n] [--json]

Inputs:
  ps_...
  /apps/chat/rooms/<roomId>/sessions/<piboSessionId>
  /apps/chat/sessions/<piboSessionId>

Next:
  pibo debug session ps_...
`);
}

function formatSchemaText(tables: Array<{ name: string; columns: Array<{ name: string; type: string; notNull: boolean; primaryKey: boolean }> }>): string {
	if (tables.length === 0) return "tables: 0";
	const lines: string[] = [];
	for (const table of tables) {
		lines.push(table.name);
		for (const column of table.columns) {
			const flags = [column.notNull ? "not-null" : "", column.primaryKey ? "pk" : ""].filter(Boolean).join(",");
			lines.push(`  ${column.name}\t${column.type}${flags ? `\t${flags}` : ""}`);
		}
	}
	return lines.join("\n");
}
