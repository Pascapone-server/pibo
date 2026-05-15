# Pibo Organizer V1

## Purpose

Pibo today works well as a single-instance agent runtime: one Web Chat UI, one local runtime, one `PIBO_HOME`, local workspaces, local tools, local sessions, and local configuration. That must remain true. A user should be able to install Pibo, run `pibo gateway:web`, open the Web Chat UI, design agents, run workflows, and never need a fleet manager.

Pibo Organizer V1 is an optional layer above that single-instance model. It manages multiple persistent Pibo instances distributed across one or more Linux servers. The Organizer is the control plane. Each Pibo instance remains its own execution plane with its own Web Chat UI and runtime.

The Organizer should make a distributed Pibo setup feel like one product without turning the existing Web Chat UI into a multi-instance UI. Operators can see all nodes and instances, create new instances, inspect health and unread signals, and open an individual instance fluidly when they need to work inside it.

## Core principles

1. Single-instance Pibo stays first-class. The Organizer must not be required for normal Pibo usage.
2. A Pibo instance is persistent by default. Its `PIBO_HOME`, sessions, skills, agents, prompts, workspaces, secrets, and accumulated state are valuable and must survive restarts.
3. The Web Chat UI remains the single-instance UI. The Organizer may proxy or embed it, but should not reimplement session rendering or agent execution across instances.
4. Runtime execution happens inside the selected Pibo instance, on the node where that instance runs. Tools operate on that node's filesystem and resources.
5. V1 uses Docker as the instance runtime substrate and a Pibo-specific Node Agent as the control surface.
6. V1 does not require Kubernetes, Docker Swarm, Nomad, or any managed cloud service.
7. HTTP polling is sufficient for V1 node communication. WebSockets can be added later for live logs or larger installations.
8. Manual node setup is acceptable in V1. Automated bare-metal provisioning can come later.
9. The Organizer host may also run worker instances by default, but must support a `control-only` mode later.

## High-level architecture

```text
Browser
  -> Organizer App on the Organizer host
    -> Organizer inventory, scheduler, proxy, and control API
    -> Node Agent on each server over HTTPS/polling
      -> Docker Engine on that server
        -> Pibo Instance containers
          -> pibo gateway:web
          -> Web Chat UI
          -> Pibo runtime and tools
          -> persistent PIBO_HOME and workspace volumes
```

The important separation is:

```text
Organizer = fleet control plane
Node Agent = per-server executor and reporter
Pibo Instance = persistent agent runtime and Web Chat UI
```

## Components

### Organizer App

The Organizer App is a new Pibo web app/plugin, separate from the existing Chat Web app.

Responsibilities:

- Store the fleet inventory: nodes, instances, reservations, URLs, labels, status, versions, and health.
- Provide the fleet UI.
- Create, start, stop, restart, upgrade, and delete instances through Node Agents.
- Schedule new instances onto suitable nodes.
- Track node capacity and instance resource reservations.
- Proxy instance Web Chat UIs so opening an instance feels integrated.
- Display high-level instance signals such as status, last activity, unread counts, recent errors, and version.
- Generate enrollment tokens for adding new nodes.
- Eventually integrate with Linear at the fleet/workflow level.

Non-responsibilities:

- It should not execute agent tools for remote instances.
- It should not directly mutate remote instance filesystems except through Node Agent lifecycle APIs.
- It should not reimplement Chat Web traces, session trees, agent designer, or local instance settings.
- It should not require all Pibo users to run an Organizer.

### Node Agent

The Node Agent is a small daemon installed manually on every Linux server that should host Pibo instances.

Responsibilities:

- Register/enroll with an Organizer.
- Report node facts: CPU, memory, disk, Docker availability, Pibo image versions, OS, hostname, labels, and health.
- Report current instance containers and their state.
- Execute Organizer commands: create instance, start, stop, restart, remove, upgrade image, collect logs, inspect health.
- Manage Docker containers, volumes, networks, ports, and labels for local Pibo instances.
- Maintain local node identity and secret material.
- Avoid printing or returning secrets in command output.

V1 installation is manual:

```bash
npm install -g @pasko70/pibo
pibo node-agent init --organizer https://organizer.example.com --enrollment-token <token>
pibo node-agent install-service
systemctl enable --now pibo-node-agent
```

The exact CLI can change, but the product flow should remain:

1. Create enrollment token in Organizer.
2. Install Pibo on node.
3. Initialize Node Agent with Organizer URL and enrollment token.
4. Start Node Agent as a service.
5. Node appears in Organizer as online.

### Pibo Instance

A Pibo instance is a persistent isolated runtime, usually a Docker container running `pibo gateway:web`.

Each instance owns:

- one `PIBO_HOME` volume
- one or more workspace mounts/volumes
- one Web Chat UI
- one gateway/web runtime
- its own sessions, rooms, agents, user skills, context files, prompts, config, auth state, and logs
- resource reservations and optional Docker limits

A Pibo instance is not a short-lived job in V1. It is closer to a persistent workspace or project runtime.

### Organizer Host

The Organizer host is the server running the Organizer App.

It may also be a worker node. For small deployments this should be the default because dedicating one whole VPS only to the Organizer would waste capacity. Later, the node can be marked as control-only:

```text
workerEnabled: false
controlOnly: true
```

This keeps the path open for larger installations where the Organizer host should not run agent workloads.

## Runtime substrate decision

### V1 decision: Docker plus Pibo Node Agent

Use Docker for isolated persistent Pibo instances. Build a Pibo-specific Node Agent and Organizer around Docker rather than adopting Kubernetes, Docker Swarm, or Nomad in V1.

Reasons:

- Docker is available on plain VPS servers such as Strato.
- It gives us container isolation, resource limits, volumes, logs, and restart policies.
- It avoids the operational complexity of Kubernetes for early self-hosted setups.
- It keeps the Pibo product model explicit instead of outsourcing it to a generic orchestrator.
- It lets us support small clusters of heterogeneous servers quickly.

The Organizer should own the Pibo concepts: instance identity, `PIBO_HOME`, workspace volumes, Web Chat entrypoints, Pibo versions, backups, Linear links, resource reservations, and UI integration.

### Not V1: Kubernetes

Kubernetes or k3s may become useful later, especially for larger clusters. For V1 it is too much platform surface relative to the problem. It introduces deployments, services, ingress, storage classes, RBAC, secrets, cluster upgrades, and operational complexity before the Pibo instance model is fully proven.

### Not V1: Docker Swarm

Docker Swarm is simpler than Kubernetes and can schedule containers across hosts, but it still does not model Pibo instances as product objects. It may become a future backend for the Node Agent or Organizer scheduler, but V1 should not depend on it.

### Possible future backend abstraction

The Node Agent can eventually support multiple backends:

```text
backend: docker-local | docker-swarm | nomad | kubernetes
```

V1 only implements `docker-local`.

## Data model draft

### Node

```ts
type PiboOrganizerNode = {
  id: string;
  name: string;
  hostname: string;
  status: "online" | "offline" | "degraded" | "draining";
  organizerHost: boolean;
  workerEnabled: boolean;
  controlOnly: boolean;
  labels: string[];
  agentVersion: string;
  dockerVersion?: string;
  lastHeartbeatAt?: string;
  capacity: {
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
  };
  usage: {
    cpuLoad?: number;
    memoryUsedMb?: number;
    diskUsedGb?: number;
  };
  reserved: {
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
  };
  metadata: Record<string, unknown>;
};
```

### Instance

```ts
type PiboOrganizerInstance = {
  id: string;
  name: string;
  nodeId: string;
  status: "creating" | "running" | "stopped" | "restarting" | "upgrading" | "failed" | "deleted";
  image: string;
  version: string;
  containerName: string;
  piboHomeVolume: string;
  workspaceVolume?: string;
  workspacePath: string;
  internalWebUrl?: string;
  proxiedWebPath: string;
  resources: {
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
  };
  health: {
    healthy: boolean;
    message?: string;
    checkedAt?: string;
  };
  activity: {
    lastSeenAt?: string;
    unreadCount?: number;
    activeSessions?: number;
    recentErrors?: number;
  };
  labels: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
```

### Enrollment token

```ts
type NodeEnrollmentToken = {
  id: string;
  tokenHash: string;
  name?: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  defaultLabels: string[];
  createdAt: string;
};
```

### Command

```ts
type NodeCommand = {
  id: string;
  nodeId: string;
  type:
    | "create_instance"
    | "start_instance"
    | "stop_instance"
    | "restart_instance"
    | "remove_instance"
    | "upgrade_instance"
    | "inspect_instance"
    | "collect_logs";
  payload: Record<string, unknown>;
  status: "queued" | "claimed" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
};
```

## Node communication

### V1 transport

Use HTTP polling from Node Agent to Organizer.

Benefits:

- No always-open connection required.
- Works behind NAT and basic firewalls.
- Nodes only need outbound HTTPS to the Organizer.
- Operationally simpler than WebSockets for V1.
- Scales well enough for small-to-medium instance counts.

### Enrollment flow

1. Operator creates an enrollment token in Organizer.
2. Operator installs Node Agent on a server.
3. Node Agent sends token and node facts to Organizer.
4. Organizer validates token and returns node ID plus node secret.
5. Node Agent stores node credentials locally.
6. Node Agent begins heartbeat and command polling.

Draft endpoints:

```text
POST /api/organizer/nodes/enroll
POST /api/organizer/nodes/:nodeId/heartbeat
GET  /api/organizer/nodes/:nodeId/commands
POST /api/organizer/nodes/:nodeId/commands/:commandId/claim
POST /api/organizer/nodes/:nodeId/commands/:commandId/result
POST /api/organizer/nodes/:nodeId/events
```

The Node Agent authenticates with a node secret after enrollment. Tokens and secrets must never be logged in plaintext.

### Heartbeat payload

```json
{
  "agentVersion": "1.0.0",
  "hostname": "worker-1",
  "docker": { "available": true, "version": "..." },
  "capacity": { "cpuCores": 4, "memoryMb": 8192, "diskGb": 160 },
  "usage": { "cpuLoad": 0.42, "memoryUsedMb": 2800, "diskUsedGb": 51 },
  "instances": [
    {
      "id": "inst_...",
      "containerName": "pibo-inst-project-a",
      "status": "running",
      "image": "pibo:1.0.6",
      "ports": { "web": 4788, "gateway": 4789 }
    }
  ]
}
```

### Command processing

The Organizer queues commands for a node. The node claims one or more commands, executes them locally, and posts results.

Command execution should be idempotent where practical:

- Creating an already-existing container with the same instance ID should return existing state if compatible.
- Starting an already-running instance should succeed.
- Stopping an already-stopped instance should succeed.
- Failed commands must preserve enough error detail for operator diagnosis without leaking secrets.

## Docker instance layout

A V1 instance container should have predictable labels and volumes.

Example container:

```bash
docker run -d \
  --name pibo-inst-<instanceId> \
  --restart unless-stopped \
  --cpus <cpuCores> \
  --memory <memoryMb>m \
  --label pibo.role=instance \
  --label pibo.instance.id=<instanceId> \
  --label pibo.instance.name=<name> \
  --label pibo.node.id=<nodeId> \
  -e HOME=/home/pibo \
  -e PIBO_HOME=/home/pibo/.pibo \
  -v pibo-home-<instanceId>:/home/pibo/.pibo \
  -v pibo-workspace-<instanceId>:/workspace \
  -w /workspace \
  pibo:<version> \
  gateway:web
```

Open questions for implementation:

- whether the image should run as root or a `pibo` user by default
- how host workspaces are mounted when a user wants to use an existing host path
- whether the Web Chat auth DB lives inside `PIBO_HOME` or a separate volume
- how instance secrets are injected and rotated

V1 should prefer Docker named volumes for managed instances. Existing host paths can be supported as an advanced option.

## Scheduling V1

The first scheduler should be simple and explicit.

Hard filters:

1. Node is online.
2. Node has `workerEnabled=true`.
3. Node is not `controlOnly=true` unless explicitly allowed.
4. Node labels match requested labels.
5. Node has enough unreserved CPU, memory, and disk.
6. Docker is available and healthy.

Capacity calculation:

```text
freeCpu = capacity.cpuCores - reserved.cpuCores
freeMemory = capacity.memoryMb - reserved.memoryMb
freeDisk = capacity.diskGb - reserved.diskGb
```

The scheduler should use reservations for placement. Live usage is useful for warnings and score adjustments, but reservations prevent overcommit surprises.

Simple scoring:

```text
score =
  normalizedFreeCpu * cpuWeight +
  normalizedFreeMemory * memoryWeight +
  normalizedFreeDisk * diskWeight -
  instanceCountPenalty -
  highLoadPenalty
```

For heterogeneous servers such as:

```text
2 CPU / 4 GB RAM
4 CPU / 8 GB RAM
6 CPU / 12 GB RAM
```

larger instances should naturally land on larger nodes, while small instances can still use smaller nodes.

V1 should allow manual node override. The scheduler should explain placement decisions in the UI.

## Instance lifecycle

### Create

1. User requests a new instance in Organizer.
2. Organizer validates name, resources, labels, and desired image/version.
3. Scheduler selects a node or accepts manual node choice.
4. Organizer creates instance row with `status=creating`.
5. Organizer queues `create_instance` command for the node.
6. Node Agent creates Docker volumes and container.
7. Node Agent starts container and checks `/health`.
8. Node Agent posts result.
9. Organizer marks instance `running` and exposes the proxied Web Chat URL.

### Stop

Stop container but retain all volumes and instance metadata.

### Start

Start existing container. If missing but volumes exist, Node Agent may recreate from instance spec.

### Restart

Stop/start container. Preserve volumes.

### Upgrade

1. Pull/build target image.
2. Stop instance.
3. Recreate container with same volumes and updated image.
4. Start instance.
5. Health check.
6. Rollback path should be planned, but V1 can initially require manual rollback.

### Delete

Deletion should be two-phase:

1. Archive/disable instance.
2. Permanent delete only after explicit confirmation.

Permanent deletion must define whether volumes are retained, snapshotted, or removed. V1 should default to preserving volumes unless the operator explicitly chooses destructive deletion.

## Reverse proxy and fluid UI

The Organizer should make opening an instance feel fluid without turning Chat Web into a fleet UI.

Recommended route shape:

```text
/apps/organizer
/apps/organizer/instances/:instanceId
/i/:instanceId/apps/chat
/i/:instanceId/api/chat
/i/:instanceId/api/auth
```

The Organizer host reverse-proxies `/i/:instanceId/*` to the target instance's Web Chat HTTP server.

Benefits:

- The user can move from Organizer to instance and back without manually switching hosts.
- Web Chat remains independently developed and deployed.
- Deep links to instance sessions can be represented under Organizer URLs.
- The Organizer can keep a fleet shell or navigation affordance around the instance view later.

Implementation concerns:

- Chat Web must support a base path or be made proxy-aware.
- Auth cookies must not collide between instances.
- `/api/auth/*`, `/api/chat/*`, static assets, and SSE endpoints must route to the correct instance.
- The Organizer should avoid reading or modifying instance internals through the proxy except for explicit bridge APIs.
- CSP and iframe restrictions should be considered if iframe embedding is used.

Preferred V1 approach: reverse proxy mount. Iframe can be a fallback/prototype, but reverse proxy is the stronger long-term integration.

## Instance summary and unread signals

The Organizer should not render full session traces. It does need compact signals so the operator knows where attention is needed.

Each instance should expose or report:

```text
health status
version
last activity
unread count
active sessions
recent errors
running jobs/runs count
storage usage
```

Possible bridge endpoints inside each instance:

```text
GET /api/organizer/health
GET /api/organizer/summary
GET /api/organizer/activity
```

Or via Node Agent:

```text
Node Agent -> local instance bridge -> Organizer heartbeat
```

V1 can start with simple health and container state, then add unread/activity once the bridge is implemented.

## Auth and security

### Organizer auth

The Organizer App should use the existing Pibo web auth stack where possible. Organizer access is administrative and should be restricted.

### Node auth

Nodes enroll with one-time or limited-use enrollment tokens. After enrollment, each node receives a long-lived node secret or key pair.

Requirements:

- Store node secrets with restrictive filesystem permissions.
- Never print enrollment tokens, node secrets, GitHub tokens, private keys, or instance secrets.
- Allow revoking a node from the Organizer.
- Treat stale/offline nodes as unavailable for scheduling.

### Instance auth and SSO

For V1, each instance can keep its own Web Chat auth. For fluid UX, this may be annoying because opening an instance could require login per instance.

A later enhancement should add Organizer-to-instance SSO:

```text
Organizer mints short-lived instance access token
Instance validates token and creates/refreshes local web session
```

Avoid shared global cookies/secrets across all instances unless deliberately designed.

### Network exposure

Node Agents should not expose public unauthenticated APIs.

V1 preferred direction:

- Node Agent communicates outbound to Organizer over HTTPS.
- Instance Web Chat ports are reachable by Organizer host or local Docker network.
- Public browser access goes through Organizer reverse proxy.

For multi-server private networking, WireGuard can later provide a clean internal network between Organizer and nodes.

## Storage and backups

Persistent instances require a backup plan.

V1 should at least track the volumes that belong to an instance:

```text
pibo-home volume
workspace volume or mount
optional logs volume
```

Future backup commands:

```text
snapshot_instance
restore_instance
export_instance
import_instance
```

Backup policy should be explicit because `PIBO_HOME` contains valuable state.

Deletion must distinguish:

```text
remove container only
remove container and keep volumes
remove container and delete volumes
```

## Linear integration

Linear belongs at the Organizer layer, not inside the single-instance Web Chat UI.

Potential later flows:

- Linear issue creates or links a Pibo instance.
- Linear project maps to a group of instances.
- Organizer displays Linear issue/project metadata on an instance.
- Organizer starts a run or workflow for a Linear issue.
- Organizer posts status or completion notes back to Linear.

V1 should leave integration points but not block on Linear.

## Relationship to existing `pibo compute`

The current `pibo compute` CLI already manages Docker workers for development and testing. It is useful prior art but should not be treated as the production Organizer design.

Reusable ideas:

- Docker image build/check logic.
- Worker labels.
- Port allocation.
- Container listing and cleanup.
- Development worktree workers.

Differences:

- Organizer instances are persistent product instances, not one-off test workers.
- Organizer instances need stable identity, volumes, health, proxy URLs, resource reservations, and UI management.
- Node Agent commands should be durable and reported back to the Organizer.

## V1 product UX

Organizer main areas:

```text
Dashboard
Nodes
Instances
Create Instance
Enrollment Tokens
Settings
```

### Dashboard

Show:

- total nodes
- online/offline nodes
- running/stopped/failed instances
- total capacity and reserved capacity
- recent errors
- recently active instances

### Nodes

Show per node:

- name/hostname
- online/offline/degraded
- CPU/RAM/disk capacity
- reserved resources
- live usage
- labels
- instance count
- worker enabled/control-only status

Actions:

- edit labels
- enable/disable worker scheduling
- drain node
- view node logs/status
- revoke node

### Instances

Show per instance:

- name
- node
- status
- version/image
- resources
- last activity
- unread/errors badge
- open Web Chat
- start/stop/restart

### Create Instance

Inputs:

- name
- optional project/labels
- resource size preset or custom CPU/RAM/disk
- workspace mode: managed volume or existing host path
- image/version
- node selection: automatic or manual

The UI should show the scheduler's selected node and reason.

## Implementation phases

### Phase 0: Specification and design

- Write this spec.
- Confirm Docker + Node Agent + Organizer App direction.
- Confirm V1 communication uses HTTP polling.
- Confirm persistent instances and manual node installation.

### Phase 1: Data model and Organizer skeleton

- Add Organizer plugin/app shell.
- Add SQLite stores for nodes, instances, enrollment tokens, and commands.
- Add basic Organizer UI routes.
- Add REST endpoints for inventory.

### Phase 2: Node Agent MVP

- Add `pibo node-agent` CLI.
- Implement init/enroll.
- Store node credentials.
- Implement heartbeat.
- Implement command polling.
- Report Docker availability and capacity.

### Phase 3: Docker instance lifecycle

- Implement create/start/stop/restart/remove instance commands.
- Add Docker labels and volume conventions.
- Add basic health checks.
- Add resource reservations in Organizer.

### Phase 4: Scheduler V1

- Implement hard filters and simple scoring.
- Support manual node override.
- Explain scheduler decisions in API/UI.

### Phase 5: Proxy/open instance UX

- Add Organizer reverse proxy route for instance Web Chat.
- Make Web Chat proxy/base-path compatible as needed.
- Add `Open` action from instance list/detail.

### Phase 6: Summary signals

- Add instance health/summary bridge.
- Show unread/activity/error badges in Organizer.

### Phase 7: Hardening

- Node revocation.
- Command retries and idempotency.
- Better logs.
- Backup/export planning.
- Upgrade flow.
- Optional WireGuard/internal-network documentation.

## Non-goals for V1

- Kubernetes cluster support.
- Docker Swarm support.
- Nomad support.
- Automatic VPS provisioning.
- Live WebSocket streaming from every node.
- Cross-instance Chat Web session rendering.
- Moving an active instance between nodes.
- Full backup/restore automation.
- Linear automation beyond design hooks.
- Multi-tenant billing/quotas.

## Open questions

1. Should managed workspaces be Docker volumes only in V1, or should existing host paths be supported immediately?
2. Should instance containers run as root or as a dedicated `pibo` user by default?
3. How should Web Chat auth behave when opened through the Organizer proxy in V1?
4. Do we need a minimal Organizer Bridge endpoint inside each instance for unread/activity in the first release, or can V1 start with container health only?
5. What image/versioning strategy should V1 use: locally built `pibo:latest`, npm-installed image, or registry-published image?
6. Should the Organizer store node command history indefinitely or prune old successful commands?
7. What is the minimum safe backup story before permanent instance deletion is allowed?

## Current recommended V1 scope

Build a pragmatic Docker-based Organizer system:

```text
Organizer App + SQLite inventory
Node Agent with manual enrollment
HTTP polling command protocol
Docker-local instance lifecycle
Persistent volumes per instance
Simple reservation-based scheduler
Reverse-proxied Web Chat entrypoints
Basic node and instance health
```

This keeps Pibo usable as a single instance while creating a clear growth path for multiple servers and many persistent Pibo runtimes.
