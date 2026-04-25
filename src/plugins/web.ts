import { createWebHostChannel, type WebHostChannelOptions } from "../web/channel.js";
import { definePiboPlugin } from "./registry.js";

export function createPiboWebHostPlugin(options: WebHostChannelOptions = {}) {
	return definePiboPlugin({
		id: "pibo.web-host",
		name: "Pibo Web Host",
		register(api) {
			api.registerChannel(createWebHostChannel(options));
		},
	});
}
