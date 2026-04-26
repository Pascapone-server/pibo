export type PiboEventSource = "user" | "ui" | "service" | "actor";

export type PiboJsonValue =
	| null
	| boolean
	| number
	| string
	| PiboJsonValue[]
	| { [key: string]: PiboJsonValue };

export type PiboJsonObject = { [key: string]: PiboJsonValue };

export type PiboMessageEvent = {
	type: "message";
	sessionKey: string;
	text: string;
	source?: PiboEventSource;
	id?: string;
};

export type BuiltinPiboExecutionAction = "status" | "session_id" | "clear_queue" | "abort" | "dispose";

export type PiboSessionExecutionAction =
	| "session.current"
	| "session.list"
	| "session.fork_candidates"
	| "session.fork"
	| "session.clone"
	| "session.tree"
	| "session.tree_navigate"
	| "session.switch";

export type PiboExecutionAction = BuiltinPiboExecutionAction | PiboSessionExecutionAction | (string & {});

export type PiboSessionForkParams = {
	entryId: string;
};

export type PiboSessionTreeNavigateParams = {
	entryId: string;
	summarize?: boolean;
	customInstructions?: string;
	replaceInstructions?: boolean;
	label?: string;
};

export type PiboSessionSwitchParams = {
	sessionFile: string;
	cwdOverride?: string;
};

export type PiboExecutionEventBase<TAction extends PiboExecutionAction = PiboExecutionAction> = {
	type: "execution";
	sessionKey: string;
	action: TAction;
	id?: string;
};

export type PiboNoParamsExecutionEvent = PiboExecutionEventBase<
	| BuiltinPiboExecutionAction
	| "session.current"
	| "session.list"
	| "session.fork_candidates"
	| "session.clone"
	| "session.tree"
>;

export type PiboSessionForkEvent = PiboExecutionEventBase<"session.fork"> & {
	params: PiboSessionForkParams;
};

export type PiboSessionTreeNavigateEvent = PiboExecutionEventBase<"session.tree_navigate"> & {
	params: PiboSessionTreeNavigateParams;
};

export type PiboSessionSwitchEvent = PiboExecutionEventBase<"session.switch"> & {
	params: PiboSessionSwitchParams;
};

export type PiboKnownExecutionEvent =
	| PiboNoParamsExecutionEvent
	| PiboSessionForkEvent
	| PiboSessionTreeNavigateEvent
	| PiboSessionSwitchEvent;

export type PiboCustomExecutionEvent = PiboExecutionEventBase<string & {}> & {
	params?: PiboJsonValue;
};

export type PiboExecutionEvent = PiboKnownExecutionEvent | PiboCustomExecutionEvent;

export type PiboInputEvent = PiboMessageEvent | PiboExecutionEvent;

export type PiboSessionStatus = {
	sessionKey: string;
	queuedMessages: number;
	processing: boolean;
	streaming: boolean;
	activeTools: string[];
	cwd: string;
	disposed: boolean;
};

export type PiboPiSessionSnapshot = {
	sessionId: string;
	sessionFile?: string;
	leafId: string | null;
	cwd: string;
	sessionName?: string;
	parentSessionFile?: string;
};

export type PiboSessionOperationResult = {
	routeSessionKey: string;
	previous: PiboPiSessionSnapshot;
	current: PiboPiSessionSnapshot;
	cancelled: boolean;
	selectedText?: string;
	editorText?: string;
	summaryEntryId?: string;
};

export type PiboForkCandidate = {
	entryId: string;
	text: string;
};

export type PiboSessionListItem = {
	path: string;
	id: string;
	cwd: string;
	name?: string;
	parentSessionPath?: string;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
};

export type PiboSessionTreeNode = {
	entry: PiboJsonObject;
	children: PiboSessionTreeNode[];
	label?: string;
	labelTimestamp?: string;
};

export type PiboSessionTreeResult = {
	current: PiboPiSessionSnapshot;
	tree: PiboSessionTreeNode[];
};

export type PiboMessageQueuedEvent = {
	type: "message_queued";
	sessionKey: string;
	eventId?: string;
	queuedMessages: number;
	text: string;
	source?: PiboEventSource;
};

export type PiboMessageStartedEvent = {
	type: "message_started";
	sessionKey: string;
	eventId?: string;
	text: string;
	source?: PiboEventSource;
};

export type PiboAssistantMessageEvent = {
	type: "assistant_message";
	sessionKey: string;
	eventId?: string;
	text: string;
};

export type PiboOutputEvent =
	| PiboMessageQueuedEvent
	| PiboMessageStartedEvent
	| { type: "message_finished"; sessionKey: string; eventId?: string }
	| { type: "assistant_delta"; sessionKey: string; eventId?: string; text: string }
	| PiboAssistantMessageEvent
	| { type: "execution_result"; sessionKey: string; eventId?: string; action: PiboExecutionAction; result: unknown }
	| { type: "session_error"; sessionKey: string; eventId?: string; error: string }
	| { type: "pi_event"; sessionKey: string; event: unknown };

export type PiboEventListener = (event: PiboOutputEvent) => void;
