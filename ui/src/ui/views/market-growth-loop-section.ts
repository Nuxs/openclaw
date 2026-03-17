import { html } from "lit";
import type { GrowthLoopItem } from "../controllers/market-steward-controller.ts";

export type MarketGrowthLoopSectionProps = {
  items: GrowthLoopItem[];
};

function phaseColor(phase: GrowthLoopItem["phase"]): string {
  switch (phase) {
    case "memory":
      return "#8B5CF6";
    case "reflection":
      return "#14B8A6";
    case "research":
      return "#3B82F6";
    case "heartbeat":
      return "#F59E0B";
  }
}

export function renderMarketGrowthLoopSection(props: MarketGrowthLoopSectionProps) {
  return html`
    <div class="card card--stretch">
      <div>
        <div class="card-title">Growth Loop</div>
        <div class="card-sub">
          Continuous steward learning lane across memory, reflection, research, and heartbeat follow-up.
        </div>
      </div>

      <div class="list list--dense" style="margin-top: 16px; display: grid; gap: 12px;">
        ${props.items.map(
          (item) => html`
            <article
              class="list-item list-item--stacked"
              style="border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 14px; background: rgba(15, 23, 42, 0.22); padding: 14px;"
            >
              <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                <div>
                  <div class="list-item__title">${item.title}</div>
                  <div class="muted" style="margin-top: 4px;">${item.detail}</div>
                </div>
                <span class="pill" style="border-color:${phaseColor(item.phase)}; color:${phaseColor(item.phase)};">
                  ${item.phase}
                </span>
              </div>
              <div class="list-item__meta" style="margin-top: 8px;">
                <span>${item.priority}</span>
                <span>${item.refs.length} refs</span>
              </div>
              ${
                item.refs.length > 0
                  ? html`<div class="pill-row" style="margin-top: 10px;">${item.refs.map((ref) => html`<span class="pill">${ref}</span>`)}</div>`
                  : null
              }
            </article>
          `,
        )}
      </div>
    </div>
  `;
}
