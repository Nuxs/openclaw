import type {
  TaskBidStatus,
  TaskOrderStatus,
  TaskReceiptStatus,
  TaskResultStatus,
} from "./types.js";

const conflict = (message: string) => new Error(`E_CONFLICT: ${message}`);

export function assertTaskOrderTransition(from: TaskOrderStatus, to: TaskOrderStatus) {
  if (from === to) {
    return;
  }
  const allowed: Record<TaskOrderStatus, TaskOrderStatus[]> = {
    task_open: ["task_awarded", "task_cancelled", "task_expired"],
    task_awarded: ["task_closed"],
    task_closed: [],
    task_cancelled: [],
    task_expired: [],
  };
  if (!allowed[from].includes(to)) {
    throw conflict(`invalid task transition: ${from} -> ${to}`);
  }
}

export function assertTaskBidTransition(from: TaskBidStatus, to: TaskBidStatus) {
  if (from === to) {
    return;
  }
  const allowed: Record<TaskBidStatus, TaskBidStatus[]> = {
    bid_submitted: ["bid_withdrawn", "bid_accepted", "bid_rejected"],
    bid_withdrawn: [],
    bid_accepted: [],
    bid_rejected: [],
  };
  if (!allowed[from].includes(to)) {
    throw conflict(`invalid task bid transition: ${from} -> ${to}`);
  }
}

export function assertTaskResultTransition(from: TaskResultStatus, to: TaskResultStatus) {
  if (from === to) {
    return;
  }
  const allowed: Record<TaskResultStatus, TaskResultStatus[]> = {
    result_submitted: ["result_accepted", "result_rejected"],
    result_accepted: [],
    result_rejected: [],
  };
  if (!allowed[from].includes(to)) {
    throw conflict(`invalid task result transition: ${from} -> ${to}`);
  }
}

export function assertTaskReceiptTransition(from: TaskReceiptStatus, to: TaskReceiptStatus) {
  if (from === to) {
    return;
  }
  const allowed: Record<TaskReceiptStatus, TaskReceiptStatus[]> = {
    receipt_pending: ["receipt_settled", "receipt_refunded", "receipt_disputed"],
    receipt_settled: [],
    receipt_refunded: [],
    receipt_disputed: ["receipt_settled", "receipt_refunded"],
  };
  if (!allowed[from].includes(to)) {
    throw conflict(`invalid task receipt transition: ${from} -> ${to}`);
  }
}
