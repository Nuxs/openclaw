import type { MarketFilters, MarketResource } from "../types.ts";

/**
 * Keep resource filtering in a leaf helper so the main market view stays thinner
 * and the service-kind contract can be tested without relying on template internals.
 */
export function filterMarketResources(params: {
  resources: MarketResource[];
  resourceKind: MarketResource["kind"] | "all";
  filters: Pick<MarketFilters, "resourceSearch" | "resourceStatus" | "resourceSort">;
}): MarketResource[] {
  const filtered = params.resources
    .filter((resource) => params.resourceKind === "all" || resource.kind === params.resourceKind)
    .filter(
      (resource) =>
        params.filters.resourceStatus === "all" ||
        resource.status === params.filters.resourceStatus,
    )
    .filter((resource) =>
      matchesText(params.filters.resourceSearch, [
        resource.resourceId,
        resource.label,
        resource.providerActorId,
        resource.offerId,
        resource.kind,
        ...(resource.tags ?? []),
      ]),
    );

  return filtered.toSorted((a, b) =>
    params.filters.resourceSort === "updated_asc"
      ? compareValues(a.updatedAt, b.updatedAt)
      : compareValues(b.updatedAt, a.updatedAt),
  );
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function matchesText(search: string | undefined, values: Array<string | null | undefined>) {
  const needle = search?.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle),
  );
}
