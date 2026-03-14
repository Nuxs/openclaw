---
name: steward-topology
description: This skill should be used when users want OpenClaw's main steward to inspect one or more devices, design or rebalance a local/trusted-circle/hybrid-cloud-edge topology, and coordinate configuration through skill-driven policy rather than hardcoded role rules.
---

# steward-topology

## Overview

Use this skill to turn OpenClaw into a **topology-planning private steward** for \(1..N\) devices.

Treat topology as a planning problem driven by:

- user goal
- device inventory
- current health and reachability
- trust boundary
- cost / latency / availability preference

Keep the architectural split strict:

- **Extension = Mechanism**: atomic facts, config mutation, verification, authority state changes
- **AI = Policy**: inventory interpretation, role assignment, rollout order, rebalance strategy, human-facing explanation

Do **not** hardcode fixed machine roles into the extension when the same outcome can be produced by a reusable steward workflow.

## Trigger

Activate this skill when any of the following is true:

- The user wants OpenClaw to organize **one device** into a usable local-first steward node.
- The user wants OpenClaw to organize **multiple devices** into a trusted-circle or hybrid-cloud-edge topology.
- The user asks to **rebalance** an existing test or production topology after adding/removing machines.
- The user explicitly says not to hardcode roles and wants the **main steward** to decide how to configure the fleet.
- The task involves turning a device list into a **role matrix + apply sequence + verification checklist**.

Typical prompts include:

- “盘点我这几台机器，给我最合适的 OpenClaw 拓扑。”
- “我只有一台设备，先给我单机可用方案。”
- “新增一台 Windows，重分配当前测试网络。”
- “别写死角色，按机器能力和网络条件自动规划。”

## Non-negotiables

Always preserve these invariants:

- Keep `web3.*` as the public contract.
- Keep `market.*` as the authority plane.
- Keep **Extension = Mechanism, AI = Policy**.
- Treat **single-node** as the \(N=1\) case of the same planner, not as a separate product.
- Never claim multi-node automation already exists unless verified in repo/runtime.
- Never leak tokens, provider endpoints, or real file paths in normal outputs.
- Keep topology class as an **output of planning**, not a rigid user-facing enum that must be hardcoded everywhere.

## Workflow

### 1. Classify the scope

Determine whether the task is:

- **Inventory only**: inspect devices and summarize current state
- **Plan only**: generate topology and rollout sequence
- **Plan + apply**: mutate config on one or more nodes
- **Verify / rebalance**: compare desired state with actual state and repair drift

### 2. Build the machine inventory

Prefer current repo/runtime facts first.

Collect or infer for each node:

- label / friendly name
- OS and hardware shape
- always-on vs intermittent availability
- current OpenClaw install / plugin state
- reachable runtimes (for example Ollama or provider HTTP)
- current consumer / provider / hybrid posture
- network reachability and trust tier
- whether the node is a good candidate for control, authority, or backup duties

When user input is incomplete, fill only the essential gaps. Prefer using `assets/machine-inventory.template.yaml` as the structured fallback.

### 3. Infer the topology family

Infer topology from facts instead of forcing the user to pick marketing labels first.

Use these defaults:

- **One node** → local-first single-node steward
- **Several private devices on the same operator / LAN / Tailscale** → trusted-circle
- **At least one always-on server plus one or more edge devices** → hybrid-cloud-edge

Treat labels such as `single-node`, `trusted-circle`, and `hybrid-cloud-edge` as **summaries of the chosen plan**, not as the planner's only reasoning input.

### 4. Assign roles dynamically

Assign roles from capability and trust, not from fixed machine names.

Possible roles include:

- **control**: chat front door, operator UX, deployment coordination
- **authority**: `market-core` authority + durable store + bootstrap / fallback discovery
- **provider-primary**: main inference / execution node
- **provider-secondary**: overflow / backup capacity
- **consumer-primary**: default local user workload initiator
- **relay-index-monitor**: lightweight supporting node for discovery/index/monitoring
- **hybrid-edge**: both consume and provide under constraints

Prefer the smallest role set that satisfies the user goal. Avoid inventing extra roles just because more machines exist.

### 5. Produce a staged rollout

Emit a rollout in this order:

1. authority / bootstrap / control prerequisites
2. primary provider enablement
3. secondary providers / backups
4. consumer-side routing and discovery
5. end-to-end verification
6. rollback points and degraded-mode fallback

For \(N=1\), collapse this to a single-node rollout with local authority semantics.

### 6. Use current repo mechanisms where available

Prefer existing mechanisms instead of inventing fantasy APIs:

- `web3.market.preset.preview`
- `web3.market.preset.verify`
- `config.get`
- `config.apply`
- `market.status.summary`
- `web3.monitor.health`
- `web3.index.stats`
- `market.resource.list`
- `market.lease.list`

Treat the current `market-assistant` keyword parser as a **compatibility shim**, not the final control architecture.

### 7. Identify minimal mechanism gaps

When current mechanisms are insufficient, propose **small atomic additions** rather than embedding policy in extensions.

Prefer additions shaped like:

- node snapshot collection
- runtime probing
- config patch preview / apply
- cross-node verification facts
- durable desired-state records

Avoid additions shaped like:

- giant hardcoded topology switch statements
- natural-language parsers inside extensions
- fixed hostnames mapped to fixed roles in code

### 8. Return a steward-grade result

Return these sections whenever possible:

- **inventory summary**
- **recommended topology**
- **per-node role matrix**
- **apply order**
- **verification checklist**
- **rollback / degraded mode**
- **why this plan beats simpler alternatives**

## Decision heuristics

Use these high-level heuristics:

- Prefer **Mac / personal workstation** as control node when it is the user's daily operator surface.
- Prefer an **always-on server** as authority/bootstrap node when durability matters more than raw inference speed.
- Prefer the **strongest GPU box** as primary provider when the workload is model inference.
- Prefer lightweight cloud nodes for **fallback, relay, index, monitoring**, not for pretending to be primary GPU providers.
- Prefer a second workstation as **consumer-first** or **light hybrid** before promoting it to a critical authority role.
- When only one device exists, choose **local-first hybrid** with discovery off by default unless a clear reason exists to enable multi-node behavior.

## Single-device policy

When the user only has one device:

- Recommend a **usable local steward** first.
- Collapse control, authority, consumer, and optional provider roles into one node.
- Keep discovery and market publication conservative by default.
- Optimize for “works now on this machine” rather than pretending a distributed system exists.
- Present the future multi-node path as an additive upgrade, not a prerequisite.

## Six-device policy

When the user has a fleet such as workstation + Mac + several servers:

- Use the user's main daily machine as **control / steward front door** unless its uptime is poor.
- Use one always-on server as **authority + durable discovery fallback**.
- Use the best GPU workstation as **provider-primary**.
- Use smaller servers as **provider-secondary / relay / monitor**.
- Use spare personal machines as **consumer-first** or **light hybrid** depending on trust and thermal/power limits.
- Recompute the topology whenever inventory, reachability, or workload goal changes.

## References

Load these before drafting or applying a serious topology plan:

- `references/stage2-architecture.md`
- `skills/web3-market/SKILL.md`
- `skills/web3-butler/SKILL.md`
- `assets/machine-inventory.template.yaml`

## Anti-patterns

Avoid these mistakes:

- Treating current hardcoded setup phrases as the final architecture
- Conflating a design target with current repo truth
- Baking specific hostnames or device names into extension logic
- Requiring multi-node complexity when one-device mode would solve the user's actual need
- Expanding extension files into giant orchestration brains instead of keeping them as thin mechanisms
