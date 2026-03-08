import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import {
  addCronJob,
  cancelCronEdit,
  getVisibleCronJobs,
  hasCronFormErrors,
  loadCronRuns,
  loadMoreCronJobs,
  loadMoreCronRuns,
  normalizeCronFormState,
  reloadCronJobs,
  removeCronJob,
  runCronJob,
  startCronClone,
  startCronEdit,
  toggleCronJob,
  updateCronJobsFilter,
  updateCronRunsFilter,
  validateCronForm,
} from "./controllers/cron.ts";
import { resolveConfiguredCronModelSuggestions, sortLocaleStrings } from "./views/agents-utils.ts";
import { renderCron } from "./views/cron.ts";

const CRON_THINKING_SUGGESTIONS = ["off", "minimal", "low", "medium", "high"];
const CRON_TIMEZONE_SUGGESTIONS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
];

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeSuggestionValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

export function renderCronTab(state: AppViewState) {
  if (state.tab !== "cron") {
    return nothing;
  }

  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const cronAgentSuggestions = sortLocaleStrings(
    new Set(
      [
        ...(state.agentsList?.agents?.map((entry) => entry.id.trim()) ?? []),
        ...state.cronJobs
          .map((job) => (typeof job.agentId === "string" ? job.agentId.trim() : ""))
          .filter(Boolean),
      ].filter(Boolean),
    ),
  );
  const cronModelSuggestions = sortLocaleStrings(
    new Set(
      [
        ...state.cronModelSuggestions,
        ...resolveConfiguredCronModelSuggestions(configValue),
        ...state.cronJobs
          .map((job) => {
            if (job.payload.kind !== "agentTurn" || typeof job.payload.model !== "string") {
              return "";
            }
            return job.payload.model.trim();
          })
          .filter(Boolean),
      ].filter(Boolean),
    ),
  );
  const visibleCronJobs = getVisibleCronJobs(state);
  const selectedDeliveryChannel =
    state.cronForm.deliveryChannel && state.cronForm.deliveryChannel.trim()
      ? state.cronForm.deliveryChannel.trim()
      : "last";
  const jobToSuggestions = state.cronJobs
    .map((job) => normalizeSuggestionValue(job.delivery?.to))
    .filter(Boolean);
  const accountToSuggestions = (
    selectedDeliveryChannel === "last"
      ? Object.values(state.channelsSnapshot?.channelAccounts ?? {}).flat()
      : (state.channelsSnapshot?.channelAccounts?.[selectedDeliveryChannel] ?? [])
  )
    .flatMap((account) => [
      normalizeSuggestionValue(account.accountId),
      normalizeSuggestionValue(account.name),
    ])
    .filter(Boolean);
  const rawDeliveryToSuggestions = uniquePreserveOrder([
    ...jobToSuggestions,
    ...accountToSuggestions,
  ]);
  const accountSuggestions = uniquePreserveOrder(accountToSuggestions);
  const deliveryToSuggestions =
    state.cronForm.deliveryMode === "webhook"
      ? rawDeliveryToSuggestions.filter((value) => isHttpUrl(value))
      : rawDeliveryToSuggestions;

  return renderCron({
    basePath: state.basePath,
    loading: state.cronLoading,
    jobsLoadingMore: state.cronJobsLoadingMore,
    status: state.cronStatus,
    jobs: visibleCronJobs,
    jobsTotal: state.cronJobsTotal,
    jobsHasMore: state.cronJobsHasMore,
    jobsQuery: state.cronJobsQuery,
    jobsEnabledFilter: state.cronJobsEnabledFilter,
    jobsScheduleKindFilter: state.cronJobsScheduleKindFilter,
    jobsLastStatusFilter: state.cronJobsLastStatusFilter,
    jobsSortBy: state.cronJobsSortBy,
    jobsSortDir: state.cronJobsSortDir,
    error: state.cronError,
    busy: state.cronBusy,
    form: state.cronForm,
    fieldErrors: state.cronFieldErrors,
    canSubmit: !hasCronFormErrors(state.cronFieldErrors),
    editingJobId: state.cronEditingJobId,
    channels: state.channelsSnapshot?.channelMeta?.length
      ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
      : (state.channelsSnapshot?.channelOrder ?? []),
    channelLabels: state.channelsSnapshot?.channelLabels ?? {},
    channelMeta: state.channelsSnapshot?.channelMeta ?? [],
    runsJobId: state.cronRunsJobId,
    runs: state.cronRuns,
    runsTotal: state.cronRunsTotal,
    runsHasMore: state.cronRunsHasMore,
    runsLoadingMore: state.cronRunsLoadingMore,
    runsScope: state.cronRunsScope,
    runsStatuses: state.cronRunsStatuses,
    runsDeliveryStatuses: state.cronRunsDeliveryStatuses,
    runsStatusFilter: state.cronRunsStatusFilter,
    runsQuery: state.cronRunsQuery,
    runsSortDir: state.cronRunsSortDir,
    agentSuggestions: cronAgentSuggestions,
    modelSuggestions: cronModelSuggestions,
    thinkingSuggestions: CRON_THINKING_SUGGESTIONS,
    timezoneSuggestions: CRON_TIMEZONE_SUGGESTIONS,
    deliveryToSuggestions,
    accountSuggestions,
    onFormChange: (patch) => {
      state.cronForm = normalizeCronFormState({ ...state.cronForm, ...patch });
      state.cronFieldErrors = validateCronForm(state.cronForm);
    },
    onRefresh: () => state.loadCron(),
    onAdd: () => addCronJob(state),
    onEdit: (job) => startCronEdit(state, job),
    onClone: (job) => startCronClone(state, job),
    onCancelEdit: () => cancelCronEdit(state),
    onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
    onRun: (job, mode) => runCronJob(state, job, mode ?? "force"),
    onRemove: (job) => removeCronJob(state, job),
    onLoadRuns: async (jobId) => {
      updateCronRunsFilter(state, { cronRunsScope: "job" });
      await loadCronRuns(state, jobId);
    },
    onLoadMoreJobs: () => loadMoreCronJobs(state),
    onJobsFiltersChange: async (patch) => {
      updateCronJobsFilter(state, patch);
      const shouldReload =
        typeof patch.cronJobsQuery === "string" ||
        Boolean(patch.cronJobsEnabledFilter) ||
        Boolean(patch.cronJobsSortBy) ||
        Boolean(patch.cronJobsSortDir);
      if (shouldReload) {
        await reloadCronJobs(state);
      }
    },
    onJobsFiltersReset: async () => {
      updateCronJobsFilter(state, {
        cronJobsQuery: "",
        cronJobsEnabledFilter: "all",
        cronJobsScheduleKindFilter: "all",
        cronJobsLastStatusFilter: "all",
        cronJobsSortBy: "nextRunAtMs",
        cronJobsSortDir: "asc",
      });
      await reloadCronJobs(state);
    },
    onLoadMoreRuns: () => loadMoreCronRuns(state),
    onRunsFiltersChange: async (patch) => {
      updateCronRunsFilter(state, patch);
      if (state.cronRunsScope === "all") {
        await loadCronRuns(state, null);
        return;
      }
      await loadCronRuns(state, state.cronRunsJobId);
    },
  });
}
