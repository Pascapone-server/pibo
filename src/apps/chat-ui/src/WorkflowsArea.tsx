import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BookOpenText, Brain, CheckCheck, CopyPlus, Layers, Loader2, RefreshCw } from "lucide-react";
import { getWorkflowProfilePicker, type WorkflowProfilePickerOption, type WorkflowProfilePickerResponse } from "./api";

const DEFAULT_AGENT_PROMPT_TEMPLATE = "Use the workflow input to produce a concise answer.\n\n{{input}}";

export function WorkflowsArea() {
	return (
		<main className="h-full min-h-0 overflow-auto bg-[#101d22]">
			<section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 max-[720px]:p-4" aria-labelledby="workflows-title">
				<div className="rounded-sm border border-slate-800 bg-[#151f24] p-5 shadow-lg shadow-black/20">
					<div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#11a4d4]">Workflow UI Authoring V2</div>
					<h1 id="workflows-title" className="mt-2 text-2xl font-extrabold tracking-tight text-slate-100">Workflows</h1>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
						Browse workflow definitions and prepare UI-authored drafts from the Chat Web product surface. This area is served by the existing authenticated Chat Web app.
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<WorkflowSurfaceCard
						icon={BookOpenText}
						eyebrow="Global catalog"
						title="Workflow Library"
						description="Find code-registered workflows, UI drafts, and published UI versions from one library surface."
					>
						<WorkflowEmptyState
							title="Library entries will appear here"
							description="The next V2 catalog stories connect this panel to workflow records, versions, source, status, and duplicate actions."
						/>
					</WorkflowSurfaceCard>

					<WorkflowSurfaceCard
						icon={Layers}
						eyebrow="Visual authoring"
						title="Workflow Builder"
						description="Edit UI drafts by composing registered agents, handlers, adapters, guards, prompts, and human actions into Pibo Workflow IR."
					>
						<WorkflowBuilderAgentNodeEditor />
					</WorkflowSurfaceCard>
				</div>

				<div className="grid gap-3 rounded-sm border border-slate-800 bg-[#151f24] p-4 text-xs text-slate-400 md:grid-cols-3">
					<WorkflowPrinciple icon={CheckCheck} label="Pibo Workflow IR remains the source of truth" />
					<WorkflowPrinciple icon={CopyPlus} label="Code workflows can be duplicated into UI drafts" />
					<WorkflowPrinciple icon={Layers} label="XState stays a visualization projection" />
				</div>
			</section>
		</main>
	);
}

function WorkflowBuilderAgentNodeEditor() {
	const [selectedProfileId, setSelectedProfileId] = useState(readInitialProfileRef);
	const [promptTemplate, setPromptTemplate] = useState(DEFAULT_AGENT_PROMPT_TEMPLATE);
	const [picker, setPicker] = useState<WorkflowProfilePickerResponse | undefined>();
	const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
	const [errorMessage, setErrorMessage] = useState<string | undefined>();

	useEffect(() => {
		let cancelled = false;
		setLoadState("loading");
		setErrorMessage(undefined);
		getWorkflowProfilePicker(selectedProfileId || undefined)
			.then((response) => {
				if (cancelled) return;
				setPicker(response);
				setLoadState("loaded");
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setErrorMessage(error instanceof Error ? error.message : "Failed to load workflow profile picker");
				setLoadState("error");
			});
		return () => {
			cancelled = true;
		};
	}, [selectedProfileId]);

	const selectedOption = useMemo(
		() => picker?.options.find((option) => option.id === picker.selectedProfileId),
		[picker],
	);
	const diagnostics = picker?.diagnostics ?? [];

	return (
		<div className="flex w-full flex-col gap-4 rounded-sm border border-slate-800 bg-[#101d22]/70 p-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#11a4d4]">
						<Brain size={13} />
						Agent node editor
					</div>
					<p className="mt-2 text-xs leading-5 text-slate-500">
						Select a non-archived Agent Designer profile and edit the direct prompt template stored on the Pibo Workflow IR node.
					</p>
				</div>
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded-sm border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-[#11a4d4]/60 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => void refreshProfilePicker(selectedProfileId, setPicker, setLoadState, setErrorMessage)}
					disabled={loadState === "loading"}
				>
					{loadState === "loading" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
					Refresh
				</button>
			</div>

			<label className="grid gap-2 text-xs font-semibold text-slate-300">
				<span>Agent Designer profile</span>
				<select
					aria-label="Agent Designer profile"
					className="rounded-sm border border-slate-700 bg-[#151f24] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[#11a4d4] disabled:opacity-60"
					value={picker?.selectedProfileId ?? ""}
					onChange={(event) => setSelectedProfileId(event.target.value)}
					disabled={loadState === "loading" || loadState === "error"}
				>
					<option value="">Select a non-archived profile</option>
					{picker?.options.map((option) => (
						<option key={option.id} value={option.id}>{profileOptionLabel(option)}</option>
					))}
				</select>
			</label>

			{loadState === "error" ? (
				<div className="rounded-sm border border-red-900/70 bg-red-950/40 p-3 text-xs leading-5 text-red-200" role="alert">
					{errorMessage ?? "Failed to load workflow profile picker."}
				</div>
			) : null}

			{selectedOption ? <ProfileSelectionSummary option={selectedOption} /> : null}

			{diagnostics.length ? (
				<div className="grid gap-2" aria-label="Agent profile diagnostics">
					{diagnostics.map((diagnostic) => (
						<div key={`${diagnostic.code}:${diagnostic.registryRef}`} className="rounded-sm border border-amber-700/70 bg-amber-950/30 p-3 text-xs leading-5 text-amber-100">
							<div className="flex items-center gap-2 font-bold text-amber-200"><AlertTriangle size={13} />{diagnostic.code}</div>
							<div className="mt-1">{diagnostic.message}</div>
							<div className="mt-1 text-amber-200/80">{diagnostic.hint}</div>
						</div>
					))}
				</div>
			) : null}

			<label className="grid gap-2 text-xs font-semibold text-slate-300">
				<span>Prompt template</span>
				<textarea
					aria-label="Agent prompt template"
					className="min-h-28 resize-y rounded-sm border border-slate-700 bg-[#151f24] px-3 py-2 font-mono text-xs leading-5 text-slate-100 outline-none transition focus:border-[#11a4d4]"
					value={promptTemplate}
					onChange={(event) => setPromptTemplate(event.target.value)}
				/>
				<span className="text-[11px] font-normal leading-5 text-slate-500">
					This editor is enabled for Agent nodes with a direct <code className="rounded bg-slate-900 px-1 text-slate-300">promptTemplate</code>. Nodes backed by registered prompt builders remain registry-controlled.
				</span>
			</label>

			<div className="rounded-sm border border-slate-800 bg-[#151f24]/70 p-3 text-[11px] leading-5 text-slate-500">
				Archived profiles are intentionally omitted from the picker. If a loaded draft already references one, the API returns a structured diagnostic and keeps the selection empty.
			</div>
		</div>
	);
}

function readInitialProfileRef(): string {
	if (typeof window === "undefined") return "";
	return new URL(window.location.href).searchParams.get("profileRef") ?? "";
}

async function refreshProfilePicker(
	selectedProfileId: string,
	setPicker: (picker: WorkflowProfilePickerResponse | undefined) => void,
	setLoadState: (state: "loading" | "loaded" | "error") => void,
	setErrorMessage: (message: string | undefined) => void,
): Promise<void> {
	setLoadState("loading");
	setErrorMessage(undefined);
	try {
		setPicker(await getWorkflowProfilePicker(selectedProfileId || undefined));
		setLoadState("loaded");
	} catch (error) {
		setErrorMessage(error instanceof Error ? error.message : "Failed to load workflow profile picker");
		setLoadState("error");
	}
}

function profileOptionLabel(option: WorkflowProfilePickerOption): string {
	return option.source === "custom" ? `${option.displayName} (custom)` : `${option.displayName} (global)`;
}

function ProfileSelectionSummary({ option }: { option: WorkflowProfilePickerOption }) {
	return (
		<div className="rounded-sm border border-slate-800 bg-[#151f24]/70 p-3 text-xs leading-5 text-slate-400">
			<div className="font-semibold text-slate-200">Selected profile: {option.displayName}</div>
			{option.description ? <div className="mt-1 text-slate-500">{option.description}</div> : null}
			<div className="mt-2 flex flex-wrap gap-2 text-[11px]">
				<ProfilePill label={option.source === "custom" ? "Custom Agent" : "Global profile"} />
				<ProfilePill label={`${option.nativeTools.length} native tools`} />
				<ProfilePill label={`${option.skills.length} skills`} />
				<ProfilePill label={`${option.contextFiles.length} context files`} />
			</div>
		</div>
	);
}

function ProfilePill({ label }: { label: string }) {
	return <span className="rounded-full border border-slate-700 bg-[#101d22] px-2 py-0.5 text-slate-400">{label}</span>;
}

function WorkflowSurfaceCard({ icon: Icon, eyebrow, title, description, children }: { icon: LucideIcon; eyebrow: string; title: string; description: string; children: ReactNode }) {
	return (
		<section className="flex min-h-72 flex-col rounded-sm border border-slate-800 bg-[#151f24] p-5 shadow-lg shadow-black/20">
			<div className="flex items-start gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-[#11a4d4]/35 bg-[#11a4d4]/10 text-[#11a4d4]">
					<Icon size={18} />
				</div>
				<div className="min-w-0">
					<div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</div>
					<h2 className="mt-1 text-lg font-bold text-slate-100">{title}</h2>
					<p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
				</div>
			</div>
			<div className="mt-5 flex flex-1">{children}</div>
		</section>
	);
}

function WorkflowEmptyState({ title, description }: { title: string; description: string }) {
	return (
		<div className="flex w-full flex-col justify-center rounded-sm border border-dashed border-slate-700 bg-[#101d22]/70 p-4 text-center">
			<div className="text-sm font-semibold text-slate-200">{title}</div>
			<p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
		</div>
	);
}

function WorkflowPrinciple({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
	return (
		<div className="flex items-center gap-2 rounded-sm border border-slate-800 bg-[#101d22]/60 px-3 py-2">
			<Icon size={14} className="shrink-0 text-[#11a4d4]" />
			<span>{label}</span>
		</div>
	);
}
