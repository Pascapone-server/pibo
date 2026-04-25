import { createChatWebApp, type ChatWebAppOptions } from "../apps/chat/web-app.js";
import { definePiboPlugin } from "./registry.js";

export type { ChatWebAppOptions } from "../apps/chat/web-app.js";

export function createPiboChatWebPlugin(options: ChatWebAppOptions = {}) {
	return definePiboPlugin({
		id: "pibo.chat-web",
		name: "Pibo Chat Web",
		register(api) {
			api.registerWebApp(createChatWebApp(options));
		},
	});
}
