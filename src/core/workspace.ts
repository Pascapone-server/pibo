import { homedir } from "node:os";

export function getDefaultPiboWorkspace(): string {
	const home = homedir();
	return home.length > 0 ? home : process.cwd();
}
