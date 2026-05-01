import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { App, type ChatAppRoute } from "./App";
import "./styles.css";

function ChatRoute(route: ChatAppRoute) {
	return function ChatRouteComponent() {
		return <App route={route} />;
	};
}

const rootRoute = createRootRoute();
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: ChatRoute({ area: "sessions" }),
});
const sessionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "sessions/$piboSessionId",
	component: () => {
		const { piboSessionId } = sessionRoute.useParams();
		return <App route={{ area: "sessions", piboSessionId }} />;
	},
});
const roomRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "rooms/$roomId",
	component: () => {
		const { roomId } = roomRoute.useParams();
		return <App route={{ area: "sessions", roomId }} />;
	},
});
const roomSessionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "rooms/$roomId/sessions/$piboSessionId",
	component: () => {
		const { roomId, piboSessionId } = roomSessionRoute.useParams();
		return <App route={{ area: "sessions", roomId, piboSessionId }} />;
	},
});
const agentsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "agents",
	component: ChatRoute({ area: "agents" }),
});
const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "settings",
	component: ChatRoute({ area: "settings" }),
});
const router = createRouter({
	routeTree: rootRoute.addChildren([indexRoute, sessionRoute, roomRoute, roomSessionRoute, agentsRoute, settingsRoute]),
	basepath: "/apps/chat",
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
