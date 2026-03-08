import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import { assertTaskOrderTransition } from "../task-state-machine.js";
import type { TaskOrder, TaskOrderFilter } from "../types.js";
import {
  requireLimit,
  requireOptionalEnum,
  requireString,
  requireStringArray,
} from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

function requireBudget(input: Record<string, unknown>): TaskOrder["budget"] {
  const budget = input.budget;
  if (!budget || typeof budget !== "object") {
    throw new Error("E_INVALID_ARGUMENT: budget is required");
  }
  const record = budget as Record<string, unknown>;
  const amount = requireString(record.amount, "budget.amount");
  if (!/^\d+$/.test(amount)) {
    throw new Error("E_INVALID_ARGUMENT: budget.amount must be integer string");
  }
  return {
    amount,
    currency: requireString(record.currency, "budget.currency"),
  };
}

function requireExpiryAt(input: Record<string, unknown>): string {
  const expiryAt = requireString(input.expiryAt, "expiryAt");
  if (Number.isNaN(Date.parse(expiryAt))) {
    throw new Error("E_INVALID_ARGUMENT: expiryAt must be an ISO timestamp");
  }
  return expiryAt;
}

function filterTasks(tasks: TaskOrder[], filter: TaskOrderFilter): TaskOrder[] {
  let entries = tasks;
  if (filter.taskId) {
    entries = entries.filter((task) => task.taskId === filter.taskId);
  }
  if (filter.creatorActorId) {
    entries = entries.filter((task) => task.creatorActorId === filter.creatorActorId);
  }
  if (filter.status) {
    entries = entries.filter((task) => task.status === filter.status);
  }
  return entries;
}

export function createTaskPublishHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const createdAt = nowIso();
      const taskId = randomUUID();
      const task: TaskOrder = {
        taskId,
        creatorActorId: actorId,
        title: requireString(input.title, "title"),
        summary: typeof input.summary === "string" ? input.summary.trim() : undefined,
        requirements: requireStringArray(input, "requirements", {
          min: undefined,
        } as never),
        budget: requireBudget(input),
        status: "task_open",
        expiryAt: requireExpiryAt(input),
        createdAt,
        updatedAt: createdAt,
        taskHash: "",
        metadata:
          input.metadata && typeof input.metadata === "object"
            ? (input.metadata as Record<string, unknown>)
            : undefined,
      };
      task.taskHash = hashCanonical({
        taskId,
        creatorActorId: task.creatorActorId,
        title: task.title,
        requirements: task.requirements,
        budget: task.budget,
        expiryAt: task.expiryAt,
      });
      await store.runInTransaction(() => {
        store.saveTask(task);
      });
      await recordAuditWithAnchor({
        store,
        config,
        kind: "task_published",
        refId: taskId,
        hash: task.taskHash,
        anchorId: `task:${taskId}`,
        actor: actorId,
        details: {
          budget: task.budget,
          expiryAt: task.expiryAt,
        },
      });
      respond(true, { taskId, status: task.status, taskHash: task.taskHash });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTaskGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const taskId = requireString(input.taskId, "taskId");
      const task = store.getTask(taskId);
      if (!task) {
        throw new Error("E_NOT_FOUND: task not found");
      }
      respond(true, { task });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTaskListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const status = requireOptionalEnum(input, "status", [
        "task_open",
        "task_awarded",
        "task_closed",
        "task_cancelled",
        "task_expired",
      ] as const);
      const limit = requireLimit(input, "limit", 50, 200);
      const entries = filterTasks(store.listTasks(), {
        taskId: typeof input.taskId === "string" ? input.taskId : undefined,
        creatorActorId: typeof input.creatorActorId === "string" ? input.creatorActorId : undefined,
        status,
        limit,
      })
        .filter((task) => {
          if (actorId && task.creatorActorId !== actorId) {
            const acceptedBid = task.awardedBidId ? store.getTaskBid(task.awardedBidId) : undefined;
            if (acceptedBid?.bidderActorId !== actorId) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, limit);
      respond(true, { count: entries.length, tasks: entries });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTaskCancelHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const reason = typeof input.reason === "string" ? input.reason.trim() : undefined;
      const task = store.getTask(requireString(input.taskId, "taskId"));
      if (!task) {
        throw new Error("E_NOT_FOUND: task not found");
      }
      assertActorMatch(config, actorId, task.creatorActorId, "creatorActorId");
      assertTaskOrderTransition(task.status, "task_cancelled");
      task.status = "task_cancelled";
      task.updatedAt = nowIso();
      task.cancellationReason = reason;
      store.saveTask(task);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "task_cancelled",
        refId: task.taskId,
        hash: task.taskHash,
        anchorId: `task:${task.taskId}:cancel`,
        actor: actorId,
        details: reason ? { reason } : undefined,
      });
      respond(true, { taskId: task.taskId, status: task.status });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTaskExpireSweepHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const now = Date.now();
      const expired: string[] = [];
      await store.runInTransaction(() => {
        for (const task of store.listTasks()) {
          if (task.status !== "task_open") {
            continue;
          }
          if (Date.parse(task.expiryAt) > now) {
            continue;
          }
          assertTaskOrderTransition(task.status, "task_expired");
          task.status = "task_expired";
          task.updatedAt = nowIso();
          store.saveTask(task);
          expired.push(task.taskId);
        }
      });
      for (const taskId of expired) {
        const task = store.getTask(taskId);
        if (!task) {
          continue;
        }
        await recordAuditWithAnchor({
          store,
          config,
          kind: "task_expired",
          refId: task.taskId,
          hash: task.taskHash,
          anchorId: `task:${task.taskId}:expire`,
          actor: task.creatorActorId,
        });
      }
      respond(true, { expiredCount: expired.length, taskIds: expired });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
