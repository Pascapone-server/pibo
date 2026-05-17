import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { piboHomePath } from "../core/pibo-home.js";
import type { PiboJsonObject } from "../core/events.js";
import {
	isWebAnnotationBindingState,
	isWebAnnotationStatus,
	isWebAnnotationTargetKind,
	type AddWebAnnotationThreadMessageInput,
	type CreateWebAnnotationBindingInput,
	type CreateWebAnnotationInput,
	type PatchWebAnnotationBindingInput,
	type PatchWebAnnotationInput,
	type WebAnnotation,
	type WebAnnotationBinding,
	type WebAnnotationBindingState,
	type WebAnnotationListFilter,
	type WebAnnotationResolvedBy,
	type WebAnnotationStatus,
	type WebAnnotationThreadMessage,
} from "./types.js";

export type WebAnnotationStoreOptions = {
	path?: string;
};

export type WebAnnotationBindingListFilter = {
	ownerScope: string;
	piboSessionId: string;
	limit?: number;
};

type WebAnnotationBindingRow = {
	id: string;
	owner_scope: string;
	pibo_session_id: string;
	pibo_room_id: string | null;
	state: WebAnnotationBindingState;
	url: string;
	title: string | null;
	target_id: string | null;
	created_at: string;
	updated_at: string | null;
	last_injected_at: string | null;
	closed_at: string | null;
	error: string | null;
	metadata_json: string | null;
};

type WebAnnotationRow = {
	id: string;
	owner_scope: string;
	pibo_session_id: string;
	pibo_room_id: string | null;
	binding_id: string | null;
	status: WebAnnotationStatus;
	note: string;
	url: string;
	title: string | null;
	target_id: string | null;
	target_kind: WebAnnotation["targetKind"];
	viewport_json: string;
	target_json: string | null;
	screenshot_ref_json: string | null;
	thread_json: string | null;
	created_at: string;
	updated_at: string | null;
	resolved_at: string | null;
	resolved_by: WebAnnotationResolvedBy | null;
	summary: string | null;
	metadata_json: string | null;
};

function nowIso(now = new Date()): string {
	return now.toISOString();
}

function parseJson<T>(json: string | null): T | undefined {
	return json ? JSON.parse(json) as T : undefined;
}

function stringifyJson(value: unknown): string | null {
	return value === undefined ? null : JSON.stringify(value);
}

function normalizeLimit(limit: number | undefined, defaultLimit: number, maxLimit: number): number {
	if (limit === undefined) return defaultLimit;
	if (!Number.isFinite(limit)) return defaultLimit;
	return Math.max(1, Math.min(Math.floor(limit), maxLimit));
}

function requireNonEmpty(value: string | undefined, field: string): string {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) throw new Error(`${field} is required`);
	return trimmed;
}

function validateJsonObject(value: PiboJsonObject | undefined, field: string): void {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
}

function validateBindingInput(input: CreateWebAnnotationBindingInput): void {
	requireNonEmpty(input.ownerScope, "ownerScope");
	requireNonEmpty(input.piboSessionId, "piboSessionId");
	requireNonEmpty(input.url, "url");
	if (input.state !== undefined && !isWebAnnotationBindingState(input.state)) throw new Error(`Invalid binding state: ${input.state}`);
	validateJsonObject(input.metadata, "metadata");
}

function validateBindingPatch(patch: PatchWebAnnotationBindingInput): void {
	if (patch.state !== undefined && !isWebAnnotationBindingState(patch.state)) throw new Error(`Invalid binding state: ${patch.state}`);
	validateJsonObject(patch.metadata, "metadata");
}

function validateAnnotationInput(input: CreateWebAnnotationInput): void {
	requireNonEmpty(input.ownerScope, "ownerScope");
	requireNonEmpty(input.piboSessionId, "piboSessionId");
	requireNonEmpty(input.note, "note");
	requireNonEmpty(input.url, "url");
	if (input.status !== undefined && !isWebAnnotationStatus(input.status)) throw new Error(`Invalid annotation status: ${input.status}`);
	if (!isWebAnnotationTargetKind(input.targetKind)) throw new Error(`Invalid annotation target kind: ${input.targetKind}`);
	if (!input.viewport || typeof input.viewport.width !== "number" || typeof input.viewport.height !== "number") {
		throw new Error("viewport width and height are required");
	}
	validateJsonObject(input.metadata, "metadata");
}

function validateAnnotationPatch(patch: PatchWebAnnotationInput): void {
	if (patch.status !== undefined && !isWebAnnotationStatus(patch.status)) throw new Error(`Invalid annotation status: ${patch.status}`);
	if (patch.summary !== undefined && patch.summary !== null && typeof patch.summary !== "string") throw new Error("summary must be a string or null");
	if (patch.resolvedBy !== undefined && patch.resolvedBy !== null && patch.resolvedBy !== "human" && patch.resolvedBy !== "agent") {
		throw new Error("resolvedBy must be human, agent, or null");
	}
	validateJsonObject(patch.metadata, "metadata");
}

function bindingFromRow(row: WebAnnotationBindingRow): WebAnnotationBinding {
	return {
		id: row.id,
		ownerScope: row.owner_scope,
		piboSessionId: row.pibo_session_id,
		piboRoomId: row.pibo_room_id ?? undefined,
		state: row.state,
		url: row.url,
		title: row.title ?? undefined,
		targetId: row.target_id ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at ?? undefined,
		lastInjectedAt: row.last_injected_at ?? undefined,
		closedAt: row.closed_at ?? undefined,
		error: row.error ?? undefined,
		metadata: parseJson<PiboJsonObject>(row.metadata_json),
	};
}

function annotationFromRow(row: WebAnnotationRow): WebAnnotation {
	return {
		id: row.id,
		ownerScope: row.owner_scope,
		piboSessionId: row.pibo_session_id,
		piboRoomId: row.pibo_room_id ?? undefined,
		bindingId: row.binding_id ?? undefined,
		status: row.status,
		note: row.note,
		url: row.url,
		title: row.title ?? undefined,
		targetId: row.target_id ?? undefined,
		targetKind: row.target_kind,
		viewport: JSON.parse(row.viewport_json) as WebAnnotation["viewport"],
		target: parseJson<WebAnnotation["target"]>(row.target_json),
		screenshotRef: parseJson<WebAnnotation["screenshotRef"]>(row.screenshot_ref_json),
		thread: parseJson<WebAnnotationThreadMessage[]>(row.thread_json),
		createdAt: row.created_at,
		updatedAt: row.updated_at ?? undefined,
		resolvedAt: row.resolved_at ?? undefined,
		resolvedBy: row.resolved_by ?? undefined,
		summary: row.summary ?? undefined,
		metadata: parseJson<PiboJsonObject>(row.metadata_json),
	};
}

export class WebAnnotationStore {
	private readonly db: DatabaseSync;

	constructor(options: WebAnnotationStoreOptions = {}) {
		const dbPath = options.path ?? piboHomePath("web-annotations.sqlite");
		const resolved = dbPath === ":memory:" ? dbPath : resolve(dbPath);
		if (resolved !== ":memory:") mkdirSync(dirname(resolved), { recursive: true });
		this.db = new DatabaseSync(resolved);
		this.db.exec("PRAGMA busy_timeout = 5000");
		this.db.exec("PRAGMA foreign_keys = ON");
		if (resolved !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL");
		this.applySchema();
	}

	close(): void {
		this.db.close();
	}

	createBinding(input: CreateWebAnnotationBindingInput, now = new Date()): WebAnnotationBinding {
		validateBindingInput(input);
		const timestamp = nowIso(now);
		const binding: WebAnnotationBinding = {
			id: input.id ?? `wab_${randomUUID()}`,
			ownerScope: input.ownerScope,
			piboSessionId: input.piboSessionId,
			piboRoomId: input.piboRoomId,
			state: input.state ?? "active",
			url: input.url,
			title: input.title,
			targetId: input.targetId,
			metadata: input.metadata,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		this.db.prepare(`
			INSERT OR IGNORE INTO web_annotation_bindings (
				id, owner_scope, pibo_session_id, pibo_room_id, state, url, title, target_id,
				created_at, updated_at, last_injected_at, closed_at, error, metadata_json
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			binding.id,
			binding.ownerScope,
			binding.piboSessionId,
			binding.piboRoomId ?? null,
			binding.state,
			binding.url,
			binding.title ?? null,
			binding.targetId ?? null,
			binding.createdAt,
			binding.updatedAt ?? null,
			null,
			null,
			null,
			stringifyJson(binding.metadata),
		);
		const existing = this.getBinding(binding.ownerScope, binding.piboSessionId, binding.id);
		if (!existing) throw new Error("Failed to create web annotation binding");
		return existing;
	}

	listBindings(input: WebAnnotationBindingListFilter): WebAnnotationBinding[] {
		const limit = normalizeLimit(input.limit, 100, 500);
		return (this.db.prepare(`
			SELECT * FROM web_annotation_bindings
			WHERE owner_scope = ? AND pibo_session_id = ? AND state != 'removed'
			ORDER BY created_at DESC, id DESC
			LIMIT ?
		`).all(input.ownerScope, input.piboSessionId, limit) as WebAnnotationBindingRow[]).map(bindingFromRow);
	}

	getBinding(ownerScope: string, piboSessionId: string, id: string): WebAnnotationBinding | undefined {
		const row = this.db.prepare(`
			SELECT * FROM web_annotation_bindings
			WHERE id = ? AND owner_scope = ? AND pibo_session_id = ?
		`).get(id, ownerScope, piboSessionId) as WebAnnotationBindingRow | undefined;
		return row ? bindingFromRow(row) : undefined;
	}

	getBindingById(id: string): WebAnnotationBinding | undefined {
		const row = this.db.prepare(`
			SELECT * FROM web_annotation_bindings
			WHERE id = ? AND state != 'removed'
		`).get(id) as WebAnnotationBindingRow | undefined;
		return row ? bindingFromRow(row) : undefined;
	}

	patchBinding(ownerScope: string, piboSessionId: string, id: string, patch: PatchWebAnnotationBindingInput, now = new Date()): WebAnnotationBinding | undefined {
		validateBindingPatch(patch);
		const existing = this.getBinding(ownerScope, piboSessionId, id);
		if (!existing) return undefined;
		const state = patch.state ?? existing.state;
		const timestamp = nowIso(now);
		this.db.prepare(`
			UPDATE web_annotation_bindings
			SET state = ?, title = ?, target_id = ?, updated_at = ?, last_injected_at = ?, closed_at = ?, error = ?, metadata_json = ?
			WHERE id = ? AND owner_scope = ? AND pibo_session_id = ?
		`).run(
			state,
			patch.title !== undefined ? patch.title : existing.title ?? null,
			patch.targetId !== undefined ? patch.targetId : existing.targetId ?? null,
			timestamp,
			patch.lastInjectedAt !== undefined ? patch.lastInjectedAt : existing.lastInjectedAt ?? null,
			patch.closedAt !== undefined ? patch.closedAt : existing.closedAt ?? null,
			patch.error !== undefined ? patch.error : existing.error ?? null,
			patch.metadata !== undefined ? stringifyJson(patch.metadata) : stringifyJson(existing.metadata),
			id,
			ownerScope,
			piboSessionId,
		);
		return this.getBinding(ownerScope, piboSessionId, id);
	}

	removeBinding(ownerScope: string, piboSessionId: string, id: string, now = new Date()): boolean {
		const result = this.db.prepare(`
			UPDATE web_annotation_bindings
			SET state = 'removed', updated_at = ?
			WHERE id = ? AND owner_scope = ? AND pibo_session_id = ?
		`).run(nowIso(now), id, ownerScope, piboSessionId);
		return Number(result.changes ?? 0) > 0;
	}

	createAnnotation(input: CreateWebAnnotationInput, now = new Date()): WebAnnotation {
		validateAnnotationInput(input);
		const timestamp = nowIso(now);
		const annotation: WebAnnotation = {
			id: input.id ?? `ann_${randomUUID()}`,
			ownerScope: input.ownerScope,
			piboSessionId: input.piboSessionId,
			piboRoomId: input.piboRoomId,
			bindingId: input.bindingId,
			status: input.status ?? "open",
			note: input.note,
			url: input.url,
			title: input.title,
			targetId: input.targetId,
			targetKind: input.targetKind,
			viewport: input.viewport,
			target: input.target,
			screenshotRef: input.screenshotRef,
			metadata: input.metadata,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		this.db.prepare(`
			INSERT OR IGNORE INTO web_annotations (
				id, owner_scope, pibo_session_id, pibo_room_id, binding_id, status, note, url, title,
				target_id, target_kind, viewport_json, target_json, screenshot_ref_json, thread_json,
				created_at, updated_at, resolved_at, resolved_by, summary, metadata_json
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			annotation.id,
			annotation.ownerScope,
			annotation.piboSessionId,
			annotation.piboRoomId ?? null,
			annotation.bindingId ?? null,
			annotation.status,
			annotation.note,
			annotation.url,
			annotation.title ?? null,
			annotation.targetId ?? null,
			annotation.targetKind,
			stringifyJson(annotation.viewport),
			stringifyJson(annotation.target),
			stringifyJson(annotation.screenshotRef),
			null,
			annotation.createdAt,
			annotation.updatedAt ?? null,
			null,
			null,
			null,
			stringifyJson(annotation.metadata),
		);
		const existing = this.getAnnotation(annotation.ownerScope, annotation.piboSessionId, annotation.id);
		if (!existing) throw new Error("Failed to create web annotation");
		return existing;
	}

	listAnnotations(input: WebAnnotationListFilter): WebAnnotation[] {
		const limit = normalizeLimit(input.limit, 100, 500);
		const clauses = ["owner_scope = ?", "pibo_session_id = ?"];
		const values: Array<string | number> = [input.ownerScope, input.piboSessionId];
		if (input.status !== undefined) {
			if (!isWebAnnotationStatus(input.status)) throw new Error(`Invalid annotation status: ${input.status}`);
			clauses.push("status = ?");
			values.push(input.status);
		}
		return (this.db.prepare(`
			SELECT * FROM web_annotations
			WHERE ${clauses.join(" AND ")}
			ORDER BY created_at DESC, id DESC
			LIMIT ?
		`).all(...values, limit) as WebAnnotationRow[]).map(annotationFromRow);
	}

	getAnnotation(ownerScope: string, piboSessionId: string, id: string): WebAnnotation | undefined {
		const row = this.db.prepare(`
			SELECT * FROM web_annotations
			WHERE id = ? AND owner_scope = ? AND pibo_session_id = ?
		`).get(id, ownerScope, piboSessionId) as WebAnnotationRow | undefined;
		return row ? annotationFromRow(row) : undefined;
	}

	patchAnnotation(ownerScope: string, piboSessionId: string, id: string, patch: PatchWebAnnotationInput, now = new Date()): WebAnnotation | undefined {
		validateAnnotationPatch(patch);
		const existing = this.getAnnotation(ownerScope, piboSessionId, id);
		if (!existing) return undefined;
		const timestamp = nowIso(now);
		const status = patch.status ?? existing.status;
		const resolvedAt = status === "resolved" && !existing.resolvedAt ? timestamp : existing.resolvedAt ?? null;
		this.db.prepare(`
			UPDATE web_annotations
			SET status = ?, updated_at = ?, resolved_at = ?, resolved_by = ?, summary = ?, metadata_json = ?
			WHERE id = ? AND owner_scope = ? AND pibo_session_id = ?
		`).run(
			status,
			timestamp,
			resolvedAt,
			patch.resolvedBy !== undefined ? patch.resolvedBy : existing.resolvedBy ?? null,
			patch.summary !== undefined ? patch.summary : existing.summary ?? null,
			patch.metadata !== undefined ? stringifyJson(patch.metadata) : stringifyJson(existing.metadata),
			id,
			ownerScope,
			piboSessionId,
		);
		return this.getAnnotation(ownerScope, piboSessionId, id);
	}

	acknowledgeAnnotation(ownerScope: string, piboSessionId: string, id: string, summary?: string, now = new Date()): WebAnnotation | undefined {
		return this.patchAnnotation(ownerScope, piboSessionId, id, { status: "acknowledged", summary }, now);
	}

	resolveAnnotation(ownerScope: string, piboSessionId: string, id: string, summary?: string, resolvedBy: WebAnnotationResolvedBy = "agent", now = new Date()): WebAnnotation | undefined {
		return this.patchAnnotation(ownerScope, piboSessionId, id, { status: "resolved", summary, resolvedBy }, now);
	}

	dismissAnnotation(ownerScope: string, piboSessionId: string, id: string, reason?: string, now = new Date()): WebAnnotation | undefined {
		return this.patchAnnotation(ownerScope, piboSessionId, id, { status: "dismissed", summary: reason }, now);
	}

	addThreadMessage(input: AddWebAnnotationThreadMessageInput, now = new Date()): WebAnnotation | undefined {
		const content = requireNonEmpty(input.content, "content");
		if (input.role !== "human" && input.role !== "agent") throw new Error("role must be human or agent");
		const existing = this.getAnnotation(input.ownerScope, input.piboSessionId, input.annotationId);
		if (!existing) return undefined;
		const thread = existing.thread ?? [];
		if (thread.length >= 100) throw new Error("annotation thread message limit reached");
		const timestamp = nowIso(now);
		const nextThread: WebAnnotationThreadMessage[] = [
			...thread,
			{ id: input.id ?? `wat_${randomUUID()}`, role: input.role, content, createdAt: timestamp },
		];
		this.db.prepare(`
			UPDATE web_annotations
			SET thread_json = ?, updated_at = ?
			WHERE id = ? AND owner_scope = ? AND pibo_session_id = ?
		`).run(stringifyJson(nextThread), timestamp, input.annotationId, input.ownerScope, input.piboSessionId);
		return this.getAnnotation(input.ownerScope, input.piboSessionId, input.annotationId);
	}

	private applySchema(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS web_annotation_bindings (
				id TEXT PRIMARY KEY,
				owner_scope TEXT NOT NULL,
				pibo_session_id TEXT NOT NULL,
				pibo_room_id TEXT,
				state TEXT NOT NULL,
				url TEXT NOT NULL,
				title TEXT,
				target_id TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT,
				last_injected_at TEXT,
				closed_at TEXT,
				error TEXT,
				metadata_json TEXT
			);
			CREATE INDEX IF NOT EXISTS idx_web_annotation_bindings_session
				ON web_annotation_bindings(owner_scope, pibo_session_id, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_web_annotation_bindings_target
				ON web_annotation_bindings(target_id, state);

			CREATE TABLE IF NOT EXISTS web_annotations (
				id TEXT PRIMARY KEY,
				owner_scope TEXT NOT NULL,
				pibo_session_id TEXT NOT NULL,
				pibo_room_id TEXT,
				binding_id TEXT,
				status TEXT NOT NULL,
				note TEXT NOT NULL,
				url TEXT NOT NULL,
				title TEXT,
				target_id TEXT,
				target_kind TEXT NOT NULL,
				viewport_json TEXT NOT NULL,
				target_json TEXT,
				screenshot_ref_json TEXT,
				thread_json TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT,
				resolved_at TEXT,
				resolved_by TEXT,
				summary TEXT,
				metadata_json TEXT
			);
			CREATE INDEX IF NOT EXISTS idx_web_annotations_session_status_created
				ON web_annotations(owner_scope, pibo_session_id, status, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_web_annotations_session_created
				ON web_annotations(owner_scope, pibo_session_id, created_at DESC);
		`);
	}
}

export function createDefaultWebAnnotationStore(): WebAnnotationStore {
	return new WebAnnotationStore();
}
