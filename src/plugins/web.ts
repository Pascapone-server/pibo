import { createWebChannel, type WebChannelOptions } from "../web/channel.js";
import { definePiboPlugin } from "./registry.js";

export function createPiboWebPlugin(options: WebChannelOptions = {}) {
	return definePiboPlugin({
		id: "pibo.web",
		name: "Pibo Web",
		register(api) {
			api.registerChannel(createWebChannel(options));
		},
	});
}
