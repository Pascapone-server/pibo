import assert from 'node:assert/strict';
import test from 'node:test';

import {
	COMPUTE_RESOURCE_POLICY_ENV,
	COMPUTE_RESOURCE_POLICY_LABELS,
	DEFAULT_COMPUTE_RESOURCE_POLICY,
	buildDockerResourcePolicyArgs,
	resolveComputeResourcePolicy,
} from '../dist/compute/resource-policy.js';
import {
	LABEL_IDLE_SECONDS,
	LABEL_LAST_USED_AT,
	LABEL_OWNER_SCOPE,
	LABEL_PORT_BLOCK,
	LABEL_RALPH_JOB_ID,
	LABEL_RALPH_RUN_ID,
	LABEL_TTL_SECONDS,
	LABEL_WORKTREE,
	LABEL_WORKTREE_PATH,
	buildDevWorkerDockerRunArgs,
	buildWorkerDockerRunArgs,
	parseDockerWorkerInspect,
	parseDockerWorkerListLine,
	resolveComputeWorkerLifecycle,
} from '../dist/compute/docker.js';
import { renderComputeWorkerListText } from '../dist/compute/cli.js';

const customPolicy = Object.freeze({
	memory: '3g',
	memorySwap: '3g',
	pidsLimit: 321,
	shmSize: '768m',
	init: true,
	restart: 'no',
	logDriver: 'json-file',
	logMaxSize: '12m',
	logMaxFile: 4,
});

function valueAfter(args, flag) {
	const index = args.indexOf(flag);
	assert.notEqual(index, -1, `expected ${flag} in ${args.join(' ')}`);
	return args[index + 1];
}

function labels(args) {
	const result = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--label') result.push(args[i + 1]);
	}
	return result;
}

test('compute resource policy resolves safe defaults and documented env overrides', () => {
	assert.deepEqual(resolveComputeResourcePolicy({}), DEFAULT_COMPUTE_RESOURCE_POLICY);

	const policy = resolveComputeResourcePolicy({
		[COMPUTE_RESOURCE_POLICY_ENV.memory]: '4g',
		[COMPUTE_RESOURCE_POLICY_ENV.memorySwap]: '4g',
		[COMPUTE_RESOURCE_POLICY_ENV.pidsLimit]: '900',
		[COMPUTE_RESOURCE_POLICY_ENV.shmSize]: '1g',
		[COMPUTE_RESOURCE_POLICY_ENV.init]: 'false',
		[COMPUTE_RESOURCE_POLICY_ENV.logMaxSize]: '20m',
		[COMPUTE_RESOURCE_POLICY_ENV.logMaxFile]: '5',
	});

	assert.deepEqual(policy, {
		memory: '4g',
		memorySwap: '4g',
		pidsLimit: 900,
		shmSize: '1g',
		init: false,
		restart: 'no',
		logDriver: 'json-file',
		logMaxSize: '20m',
		logMaxFile: 5,
	});
});

test('compute worker lifecycle labels resolve safe defaults and env overrides', () => {
	assert.deepEqual(resolveComputeWorkerLifecycle({}, {}), { ttlSeconds: 3600, idleSeconds: 1800 });
	assert.deepEqual(resolveComputeWorkerLifecycle({ ttlSeconds: 10 }, { PIBO_COMPUTE_TTL_SECONDS: '20', PIBO_COMPUTE_IDLE_SECONDS: '30' }), { ttlSeconds: 10, idleSeconds: 30 });
	assert.deepEqual(resolveComputeWorkerLifecycle({}, { PIBO_COMPUTE_TTL_SECONDS: '90', PIBO_COMPUTE_IDLE_SECONDS: '45' }), { ttlSeconds: 90, idleSeconds: 45 });
});

test('docker resource policy args include memory pids shm init restart and log bounds', () => {
	const args = buildDockerResourcePolicyArgs(customPolicy);
	assert.equal(valueAfter(args, '--memory'), '3g');
	assert.equal(valueAfter(args, '--memory-swap'), '3g');
	assert.equal(valueAfter(args, '--pids-limit'), '321');
	assert.equal(valueAfter(args, '--shm-size'), '768m');
	assert.ok(args.includes('--init'));
	assert.equal(valueAfter(args, '--restart'), 'no');
	assert.equal(valueAfter(args, '--log-driver'), 'json-file');
	assert.ok(args.includes('max-size=12m'));
	assert.ok(args.includes('max-file=4'));
});

test('one-time worker docker run args include resource policy and inspectable labels', () => {
	const args = buildWorkerDockerRunArgs({
		id: 'pibo-worker-test',
		createdAt: '2026-05-17T00:00:00.000Z',
		owner: 'user:test',
		worktreePath: '/repo/worktree',
		ttlSeconds: 7200,
		idleSeconds: 1800,
		ralphJobId: 'ralph-job-1',
		ralphRunId: 'rrun-1',
		policy: customPolicy,
	});

	assert.equal(args[0], 'run');
	assert.equal(valueAfter(args, '--name'), 'pibo-worker-test');
	assert.equal(valueAfter(args, '--memory'), '3g');
	assert.equal(valueAfter(args, '--memory-swap'), '3g');
	assert.equal(valueAfter(args, '--pids-limit'), '321');
	assert.equal(valueAfter(args, '--shm-size'), '768m');
	assert.equal(valueAfter(args, '--restart'), 'no');
	assert.ok(args.includes('--init'));
	assert.ok(args.includes('max-size=12m'));
	assert.ok(args.includes('max-file=4'));
	assert.equal(args.at(-1), 'gateway:web');

	const runLabels = labels(args);
	assert.ok(runLabels.includes('pibo.compute.role=worker'));
	assert.ok(runLabels.includes('pibo.compute.owner=user:test'));
	assert.ok(runLabels.includes(`${LABEL_OWNER_SCOPE}=user:test`));
	assert.ok(runLabels.includes(`${LABEL_WORKTREE}=worktree`));
	assert.ok(runLabels.includes(`${LABEL_WORKTREE_PATH}=/repo/worktree`));
	assert.ok(runLabels.includes(`${LABEL_PORT_BLOCK}=dynamic`));
	assert.ok(runLabels.includes('pibo.compute.port.gateway=4789'));
	assert.ok(runLabels.includes('pibo.compute.port.cdp=56663'));
	assert.ok(runLabels.includes(`${LABEL_TTL_SECONDS}=7200`));
	assert.ok(runLabels.includes(`${LABEL_IDLE_SECONDS}=1800`));
	assert.ok(runLabels.includes(`${LABEL_RALPH_JOB_ID}=ralph-job-1`));
	assert.ok(runLabels.includes(`${LABEL_RALPH_RUN_ID}=rrun-1`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.memory}=3g`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.memorySwap}=3g`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.pidsLimit}=321`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.shmSize}=768m`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.restart}=no`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.logMaxFile}=4`));
});

test('ralph-owned worker labels omit unsafe prompt-like values', () => {
	const args = buildWorkerDockerRunArgs({
		id: 'pibo-worker-unsafe',
		createdAt: '2026-05-17T00:00:00.000Z',
		owner: 'user:test',
		ralphJobId: 'This is a full prompt with spaces and secrets',
		ralphRunId: 'rrun_safe-1',
		policy: customPolicy,
	});

	const runLabels = labels(args);
	assert.ok(!runLabels.some((label) => label.includes('This is a full prompt')));
	assert.ok(runLabels.includes(`${LABEL_RALPH_RUN_ID}=rrun_safe-1`));
});

test('compute list parsing exposes Ralph ownership from Docker labels', () => {
	const line = [
		'abc123',
		'pibo-dev-ralph-test',
		'exited',
		'Exited (137) 2 minutes ago',
		'0.0.0.0:4830->4789/tcp',
		[
			'pibo.compute.role=dev',
			'pibo.compute.createdAt=2026-05-17T00:00:00.000Z',
			'pibo.compute.ownerScope=user:test',
			'pibo.compute.worktree=ralph-test',
			'pibo.compute.worktreePath=/repo/.worktrees/ralph-test',
			`${LABEL_LAST_USED_AT}=2026-05-17T00:10:00.000Z`,
			'pibo.ralph.jobId=ralph_job_1',
			'pibo.ralph.runId=rrun_1',
			`${COMPUTE_RESOURCE_POLICY_LABELS.memory}=2g`,
			`${COMPUTE_RESOURCE_POLICY_LABELS.pidsLimit}=512`,
		].join(','),
	].join('\t');

	const worker = parseDockerWorkerListLine(line);
	assert.equal(worker.id, 'abc123');
	assert.equal(worker.name, 'pibo-dev-ralph-test');
	assert.equal(worker.role, 'dev');
	assert.equal(worker.state, 'exited');
	assert.equal(worker.status, 'Exited (137) 2 minutes ago');
	assert.equal(worker.ports, '0.0.0.0:4830->4789/tcp');
	assert.equal(worker.createdAt, '2026-05-17T00:00:00.000Z');
	assert.equal(worker.lastUsedAt, '2026-05-17T00:10:00.000Z');
	assert.equal(worker.ownerScope, 'user:test');
	assert.equal(worker.worktree, 'ralph-test');
	assert.equal(worker.worktreePath, '/repo/.worktrees/ralph-test');
	assert.equal(worker.ralphJobId, 'ralph_job_1');
	assert.equal(worker.ralphRunId, 'rrun_1');
	assert.deepEqual(worker.resourcePolicy, { memory: '2g', pidsLimit: 512 });
	assert.deepEqual(worker.cleanupEligibility, {
		eligible: false,
		reasons: ['dev-worker-preserved', 'stopped'],
		nextCommands: ['pibo compute reap --include-dev --max-age-minutes <n>'],
	});
});

function inspectFixture(overrides = {}) {
	return {
		Id: overrides.Id ?? 'container-1',
		Name: overrides.Name ?? '/pibo-worker-running',
		Created: overrides.Created ?? '2026-05-17T00:00:00.000Z',
		Config: {
			Labels: {
				'pibo.compute.role': 'worker',
				'pibo.compute.createdAt': '2026-05-17T00:00:00.000Z',
				'pibo.compute.ownerScope': 'user:test',
				'pibo.compute.worktree': 'repo',
				...(overrides.omitPortLabel ? {} : { 'pibo.compute.port.gateway': '4789' }),
				[COMPUTE_RESOURCE_POLICY_LABELS.memory]: '2g',
				[COMPUTE_RESOURCE_POLICY_LABELS.memorySwap]: '2g',
				[COMPUTE_RESOURCE_POLICY_LABELS.pidsLimit]: '512',
				[COMPUTE_RESOURCE_POLICY_LABELS.shmSize]: '512m',
				[COMPUTE_RESOURCE_POLICY_LABELS.restart]: 'no',
				...(overrides.Labels ?? {}),
			},
		},
		State: overrides.State ?? { Status: 'running', Running: true, OOMKilled: false, Dead: false, ExitCode: 0, StartedAt: '2026-05-17T00:01:00.000Z' },
		NetworkSettings: overrides.NetworkSettings ?? { Ports: { '4789/tcp': [{ HostIp: '0.0.0.0', HostPort: '4830' }] } },
	};
}

test('all-state compute inspect parsing covers running stopped OOM-killed and no-port containers', () => {
	const running = parseDockerWorkerInspect(inspectFixture());
	assert.equal(running.state, 'running');
	assert.equal(running.oomKilled, false);
	assert.deepEqual(running.portMap, { '4789/tcp': '0.0.0.0:4830', gateway: '4789' });
	assert.deepEqual(running.cleanupEligibility, { eligible: false, reasons: ['running-or-retained'], nextCommands: ['pibo compute list --all --json'] });

	const stopped = parseDockerWorkerInspect(inspectFixture({ Id: 'container-2', Name: '/pibo-worker-stopped', State: { Status: 'exited', Running: false, OOMKilled: false, Dead: false, ExitCode: 0 } }));
	assert.equal(stopped.state, 'exited');
	assert.equal(stopped.status, 'exited (0)');
	assert.deepEqual(stopped.cleanupEligibility, { eligible: true, reasons: ['stopped'], nextCommands: ['pibo compute reap --max-age-minutes <n>'] });

	const oom = parseDockerWorkerInspect(inspectFixture({ Id: 'container-3', Name: '/pibo-worker-oom', State: { Status: 'exited', Running: false, OOMKilled: true, Dead: false, ExitCode: 137 } }));
	assert.equal(oom.oomKilled, true);
	assert.deepEqual(oom.cleanupEligibility.reasons, ['oom-killed', 'stopped']);

	const noPort = parseDockerWorkerInspect(inspectFixture({ Id: 'container-4', Name: '/pibo-worker-no-port', State: { Status: 'exited', Running: false, OOMKilled: false, Dead: false, ExitCode: 1 }, NetworkSettings: { Ports: {} }, omitPortLabel: true }));
	assert.equal(noPort.ports, '-');
});

test('compute list text output has empty state guidance and all-state columns', () => {
	const empty = renderComputeWorkerListText([], { all: true });
	assert.match(empty, /No Pibo worker containers found/);
	assert.match(empty, /pibo compute list --all --json/);
	assert.match(empty, /pibo compute reap --help/);

	const worker = parseDockerWorkerInspect(inspectFixture({ State: { Status: 'exited', Running: false, OOMKilled: true, Dead: false, ExitCode: 137 } }));
	const text = renderComputeWorkerListText([worker], { all: true });
	assert.match(text, /NAME\tROLE\tSTATE\tSTATUS\tOOM\tPORTS/);
	assert.match(text, /pibo-worker-running\tworker\texited\texited \(137\)\tyes/);
	assert.match(text, /mem=2g,pids=512,shm=512m/);
	assert.match(text, /eligible:oom-killed\+stopped/);
});

test('dev worker docker run args include resource policy labels worktree metadata and bounded logs', () => {
	const args = buildDevWorkerDockerRunArgs({
		id: 'pibo-dev-policy',
		worktreePath: '/repo/.worktrees/policy',
		worktreeName: 'policy',
		block: 7,
		gatewayPort: 4870,
		cdpPort: 4871,
		webPort: 4872,
		webUIPortChat: 4873,
		webUIPortContext: 4874,
		createdAt: '2026-05-17T00:00:00.000Z',
		owner: 'user:test',
		ttlSeconds: 5400,
		idleSeconds: 2700,
		ralphJobId: 'ralph-job-2',
		ralphRunId: 'rrun-2',
		hostNodeModules: '/repo/node_modules',
		policy: customPolicy,
	});

	assert.equal(valueAfter(args, '--name'), 'pibo-dev-policy');
	assert.equal(valueAfter(args, '--memory'), '3g');
	assert.equal(valueAfter(args, '--memory-swap'), '3g');
	assert.equal(valueAfter(args, '--pids-limit'), '321');
	assert.equal(valueAfter(args, '--shm-size'), '768m');
	assert.equal(valueAfter(args, '--restart'), 'no');
	assert.ok(args.includes('--init'));
	assert.ok(args.includes('max-size=12m'));
	assert.ok(args.includes('max-file=4'));
	assert.ok(args.includes('4870:4789'));
	assert.ok(args.includes('/repo/.worktrees/policy:/workspace'));
	assert.ok(args.includes('/repo/node_modules:/workspace/node_modules'));
	assert.equal(args.at(-2), '-c');
	assert.equal(args.at(-1), 'tail -f /dev/null');

	const runLabels = labels(args);
	assert.ok(runLabels.includes('pibo.compute.role=dev'));
	assert.ok(runLabels.includes(`${LABEL_PORT_BLOCK}=7`));
	assert.ok(runLabels.includes(`${LABEL_WORKTREE}=policy`));
	assert.ok(runLabels.includes(`${LABEL_WORKTREE_PATH}=/repo/.worktrees/policy`));
	assert.ok(runLabels.includes('pibo.compute.owner=user:test'));
	assert.ok(runLabels.includes(`${LABEL_OWNER_SCOPE}=user:test`));
	assert.ok(runLabels.includes('pibo.compute.port.gateway=4870'));
	assert.ok(runLabels.includes('pibo.compute.port.cdp=4871'));
	assert.ok(runLabels.includes('pibo.compute.port.chatUi=4873'));
	assert.ok(runLabels.includes(`${LABEL_TTL_SECONDS}=5400`));
	assert.ok(runLabels.includes(`${LABEL_IDLE_SECONDS}=2700`));
	assert.ok(runLabels.includes(`${LABEL_RALPH_JOB_ID}=ralph-job-2`));
	assert.ok(runLabels.includes(`${LABEL_RALPH_RUN_ID}=rrun-2`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.memory}=3g`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.memorySwap}=3g`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.pidsLimit}=321`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.shmSize}=768m`));
	assert.ok(runLabels.includes(`${COMPUTE_RESOURCE_POLICY_LABELS.logMaxSize}=12m`));
});
