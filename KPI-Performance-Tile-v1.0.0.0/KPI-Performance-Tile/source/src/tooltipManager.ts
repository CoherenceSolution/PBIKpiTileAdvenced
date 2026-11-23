/**
 * Tooltips (spec 15): content builders (pure) and a thin wrapper around the host tooltip service.
 * Using the host service gives the native look, the fields of the Tooltip role and report page
 * tooltips (the selection identity of the hovered period is passed to the host).
 */
import powerbi from "powerbi-visuals-api";

import { formatRawValue } from "./numberFormat";
import { RenderContext } from "./renderContext";
import { PeriodPoint } from "./types";
import { MESSAGES, buildComparison } from "./viewModel";

import ITooltipService = powerbi.extensibility.ITooltipService;
import ISelectionId = powerbi.visuals.ISelectionId;

export interface TooltipItem {
    displayName: string;
    value: string;
    color?: string;
    header?: string;
}

export interface TooltipContent {
    items: TooltipItem[];
    identities: ISelectionId[];
}

function extraFields(point: PeriodPoint | null, ctx: RenderContext): TooltipItem[] {
    if (!point) {
        return [];
    }
    return point.tooltipFields
        .filter(field => field.value !== null && field.value !== undefined && field.value !== "")
        .map(field => ({ displayName: field.displayName, value: formatRawValue(field.value, field.format, ctx.locale) }));
}

/** Tooltip of one period of the chart: only the fields that are available are listed (spec 15.2). */
export function buildPeriodTooltip(point: PeriodPoint, ctx: RenderContext): TooltipItem[] {
    const { data, settings, formatters, theme } = ctx;
    const c = settings.chart;
    const items: TooltipItem[] = [];
    const header = point.labels.full + (point.isOpen && c.currentIndicatorText ? ` (${c.currentIndicatorText})` : "");
    const add = (displayName: string, value: string, color?: string) => {
        if (value !== "") {
            items.push({ displayName, value, color, header });
        }
    };

    if (data.bound.actualValue) {
        add(c.actualLabel, formatters.detail(point.actual, "actualValue"), theme.mark(c.actualColor));
    } else {
        add(data.names.primaryValue ?? c.actualLabel, formatters.detail(point.primary, "primaryValue"), theme.mark(c.actualColor));
    }
    add(c.projectedLabel, formatters.detail(point.projected, "projectedValue"));
    if (point.chartRemaining > 0) {
        add(c.remainingLabel, formatters.detail(point.chartRemaining, data.bound.projectionRemaining ? "projectionRemaining" : "projectedValue"), c.projectionPatternColor);
    }
    if (c.previousYearShow) {
        add(c.previousYearLabel, formatters.detail(point.previousYear, "previousYearValue"), theme.softMark(c.previousYearColor).fill);
    }
    add(settings.target.targetLabel || "Target", formatters.detail(point.target, "targetValue"));

    for (const index of [1, 2] as const) {
        const comparison = buildComparison(index, data, { ...settings, [`comparison${index}`]: { ...settings[`comparison${index}`], show: true } }, ctx.locale, point);
        if (comparison.visible) {
            add(comparison.label.replace(/[:\s]+$/, "") || `Comparison ${index}`, comparison.valueText);
        }
    }
    if (point.projectionBelowActual) {
        add("Note", MESSAGES.projectionBelowActual);
    }
    for (const field of extraFields(point, ctx)) {
        add(field.displayName, field.value);
    }
    if (items.length === 0) {
        items.push({ displayName: "Period", value: point.labels.full, header });
    }
    return items;
}

/** Tooltip of the main value (spec 15.1). */
export function buildHeaderTooltip(ctx: RenderContext): TooltipItem[] {
    const { data, view, settings } = ctx;
    const reference = data.reference;
    const header = view.title ?? view.technicalName ?? view.primaryName;
    const items: TooltipItem[] = [];
    const add = (displayName: string, value: string | null | undefined) => {
        if (value) {
            items.push({ displayName, value, header });
        }
    };
    add("KPI", view.technicalName);
    if (reference && data.bound.period) {
        add("Period", reference.labels.full + (reference.isOpen ? ` (${settings.chart.currentIndicatorText || MESSAGES.inProgress.toLowerCase()})` : ""));
    }
    add(view.primaryName, view.primaryText);
    if (view.secondaryValueText) {
        add(view.secondaryLabel ?? data.names.secondaryValue ?? "Secondary value", view.secondaryValueText);
    }
    add(settings.target.targetLabel || "Target", view.targetValueText);
    add("Target variance", view.varianceText);
    if (view.status.visible) {
        add("Status", view.status.label);
    }
    for (const field of extraFields(reference, ctx)) {
        add(field.displayName, field.value);
    }
    return items;
}

export class TooltipManager {
    constructor(private readonly service: ITooltipService | undefined, private readonly root: HTMLElement) {}

    private get enabled(): boolean {
        try {
            return !!this.service && this.service.enabled();
        } catch {
            return false;
        }
    }

    private coordinates(event: MouseEvent | null, target: Element): number[] {
        const rootRect = this.root.getBoundingClientRect();
        if (event && (event.clientX !== 0 || event.clientY !== 0)) {
            return [event.clientX - rootRect.left, event.clientY - rootRect.top];
        }
        const rect = target.getBoundingClientRect();
        return [rect.left + rect.width / 2 - rootRect.left, rect.top + rect.height / 2 - rootRect.top];
    }

    /** Shows the tooltip on hover and on keyboard focus (accessible tooltips, spec 21). */
    public attach(target: Element, provider: () => TooltipContent | null): void {
        const show = (event: Event) => {
            if (!this.enabled) {
                return;
            }
            const content = provider();
            if (!content || content.items.length === 0) {
                return;
            }
            const pointer = event as PointerEvent;
            const isPointer = event.type.startsWith("pointer");
            const options = {
                coordinates: this.coordinates(isPointer ? pointer : null, target),
                isTouchEvent: isPointer && pointer.pointerType === "touch",
                dataItems: content.items,
                identities: content.identities
            };
            if (event.type === "pointermove") {
                this.service?.move(options);
            } else {
                this.service?.show(options);
            }
        };
        const hide = () => this.hide();
        target.addEventListener("pointerenter", show);
        target.addEventListener("pointermove", show);
        target.addEventListener("pointerleave", hide);
        target.addEventListener("focus", show);
        target.addEventListener("blur", hide);
    }

    public hide(): void {
        if (this.service) {
            try {
                this.service.hide({ immediately: true, isTouchEvent: false });
            } catch {
                // the host may already have discarded the tooltip
            }
        }
    }
}
