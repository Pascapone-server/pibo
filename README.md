# pibo

Minimal TypeScript wrapper project around Pi Coding Agent.

## Scripts

- `npm run dev` runs the TypeScript entrypoint with `tsx`.
- `npm run profile` prints the active V1 profile with loaded skills and context files.
- `npm run tui` starts the Pi TUI through the pibo wrapper.
- `npm run build` compiles to `dist/`.
- `npm run start` runs the compiled entrypoint.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm run clean` removes `dist/`.

## Philosophy

Keep the wrapper thin. Pi Coding Agent should remain the inner engine; pibo adds only the small runtime, tool, prompt, and policy layer we actually need.

## V1 Profile

The default profile is defined in `src/profiles.ts`. It loads the local `pi-agent-harness` skill, registers the two test tools `pibo_echo` and `pibo_workspace_info`, and appends the example context files from `examples/context/`.
