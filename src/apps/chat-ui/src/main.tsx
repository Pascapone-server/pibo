import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { App } from "./App";
import "./styles.css";

const rootRoute = createRootRoute({ component: App });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: App });
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

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
