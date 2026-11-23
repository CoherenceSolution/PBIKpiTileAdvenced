/**
 * Turns the converted data and the settings into the strings and states painted by the renderers.
 * Pure module (no DOM): every display rule of the tile is unit-testable here.
 */
import { NumberFormatOptions, formatNumber, isPercentFormat } from "./numberFormat";
import { periodCountCaption } from "./periods";
import { RoleName } from "./roles";
import { ComparisonSettings, DisplayUnits, TileSettings } from "./settingsSchema";
import { PeriodPoint, StatusResult, TileData } from "./types";

export type Tone = "positive" | "negative" | "neutral";

export interface ComparisonView {
    visible: boolean;
    valueText: string;
    label: string;
    tone: Tone;
    arrow: "up" | "down" | null;
    settings: ComparisonSettings;
}

export interface TileView {
    technicalName: string | null;
    category: string | null;
    title: string | null;
    subtitle: string | null;
    /** "value": a number is displayed; "noData" / "error": a message replaces it. */
    primaryState: "value" | "noData" | "error";
    primaryText: string;
    /** Name of the measure displayed as the main value (tooltip). */
    primaryName: string;
    secondaryText: string | null;
    secondaryLabel: string | null;
    secondaryValueText: string | null;
    targetText: string | null;
    targetValueText: string | null;
    varianceText: string | null;
    status: StatusResult;
    comparison1: ComparisonView;
    comparison2: ComparisonView;
    caption: string | null;
    chartMessage: string | null;
    actionUrl: string | null;
    ariaLabel: string;
    ariaDescription: string;
}

export const MESSAGES = {
    invalidValue: "Invalid value",
    noHistory: "No history available",
    noPeriod: "Add a Period field to display the history",
    projectionBelowActual: "Projection is below actual",
    inProgress: "In progress"
} as const;

export interface Formatters {
    /** Header figures: follows the "Main value" number format settings. */
    header(value: number | null, role: RoleName, displayUnits?: DisplayUnits): string;
    /** Tooltip figures: full precision of the measure format, no display unit. */
    detail(value: number | null, role: RoleName): string;
    /** Chart data labels: compact. A common display unit keeps the labels of a series comparable. */
    compact(value: number | null, role: RoleName, displayUnits?: DisplayUnits): string;
}

export function createFormatters(data: TileData, settings: TileSettings, locale?: string): Formatters {
    const mv = settings.mainValue;
    const base = (role: RoleName): NumberFormatOptions => ({
        format: data.formats[role] ?? data.formats.primaryValue,
        mode: mv.formatMode,
        displayUnits: mv.displayUnits,
        decimals: mv.decimalsAuto ? null : mv.decimals,
        thousandsSeparator: mv.thousandsSeparator,
        prefix: mv.prefix,
        suffix: mv.suffix,
        locale
    });
    return {
        header: (value, role, displayUnits) => formatNumber(value, { ...base(role), displayUnits: displayUnits ?? mv.displayUnits }),
        detail: (value, role) => formatNumber(value, { ...base(role), displayUnits: "none", decimals: mv.decimalsAuto ? null : mv.decimals }),
        compact: (value, role, displayUnits) => formatNumber(value, { ...base(role), displayUnits: displayUnits ?? "auto", prefix: "", suffix: "" })
    };
}

function headerValue(reference: PeriodPoint | null): { value: number | null; role: RoleName } {
    if (!reference) {
        return { value: null, role: "primaryValue" };
    }
    if (reference.primary !== null) {
        return { value: reference.primary, role: "primaryValue" };
    }
    // Spec 7.3: Primary empty and Secondary available -> Secondary is promoted.
    return { value: reference.secondary, role: reference.secondary !== null ? "secondaryValue" : "primaryValue" };
}

function toneOf(sign: number, direction: TileSettings["statusBadge"]["direction"], s: ComparisonSettings): Tone {
    if (!s.colorBySign || sign === 0 || direction === "neutral") {
        return "neutral";
    }
    let positive = sign > 0;
    if (direction === "lower") {
        positive = !positive;
    }
    if (s.reverseLogic) {
        positive = !positive;
    }
    return positive ? "positive" : "negative";
}

function signOfText(text: string): number {
    const trimmed = text.trim();
    if (/^[-−–]/.test(trimmed)) {
        return -1;
    }
    return /^\+/.test(trimmed) || /^[\d(]/.test(trimmed) ? (/^\+/.test(trimmed) ? 1 : 0) : 0;
}

/** Comparison of a given period (the header period by default). */
export function buildComparison(index: 1 | 2, data: TileData, settings: TileSettings, locale?: string, point?: PeriodPoint | null): ComparisonView {
    const s = index === 1 ? settings.comparison1 : settings.comparison2;
    const reference = point === undefined ? data.reference : point;
    const value = reference ? (index === 1 ? reference.comparison1 : reference.comparison2) : null;
    const prepared = reference ? (index === 1 ? reference.comparison1Text : reference.comparison2Text) : null;
    const modelLabel = reference ? (index === 1 ? reference.comparison1Label : reference.comparison2Label) : null;
    const role: RoleName = index === 1 ? "comparison1Value" : "comparison2Value";
    const hidden: ComparisonView = { visible: false, valueText: "", label: "", tone: "neutral", arrow: null, settings: s };

    if (!s.show || !reference || (value === null && prepared === null)) {
        return hidden;
    }

    let valueText: string;
    let sign: number;
    if (prepared !== null) {
        // Text prepared by the measure (e.g. "+12 (+3.4%)"): displayed as is.
        valueText = prepared;
        sign = signOfText(prepared);
    } else {
        const number = value as number;
        sign = Math.sign(number);
        if (s.format === "percent") {
            valueText = formatNumber(number, { mode: "percent", displayUnits: "none", decimals: s.decimals, thousandsSeparator: true, locale });
        } else if (s.format === "number") {
            valueText = formatNumber(number, { mode: "number", displayUnits: "none", decimals: s.decimals, thousandsSeparator: true, locale });
        } else {
            valueText = formatNumber(number, { mode: "inherit", format: data.formats[role], displayUnits: "none", decimals: null, thousandsSeparator: true, locale });
        }
        if (s.showSign && number > 0 && !valueText.startsWith("+")) {
            valueText = "+" + valueText;
        }
    }

    return {
        visible: true,
        valueText,
        label: modelLabel ?? s.label,
        tone: toneOf(sign, settings.statusBadge.direction, s),
        arrow: s.showArrow && sign !== 0 ? (sign > 0 ? "up" : "down") : null,
        settings: s
    };
}

function buildVariance(data: TileData, settings: TileSettings, formatters: Formatters, locale?: string): string | null {
    const t = settings.target;
    const reference = data.reference;
    if (!t.targetVarianceShow || !reference || reference.target === null) {
        return null;
    }
    const label = (t.targetLabel || "target").toLowerCase();
    let variance = reference.targetVariance;
    let asPercent: boolean;

    if (variance !== null) {
        asPercent = t.targetVarianceFormat === "percent" || (t.targetVarianceFormat === "auto" && isPercentFormat(data.formats.targetVariance));
    } else {
        if (data.bound.targetVariance) {
            return null;
        }
        // Presentation fallback when no Target Variance measure is provided.
        const current = headerValue(reference).value;
        if (current === null) {
            return null;
        }
        if (t.targetVarianceFormat === "absolute" || reference.target === 0) {
            variance = current - reference.target;
            asPercent = false;
        } else {
            variance = (current - reference.target) / Math.abs(reference.target);
            asPercent = true;
        }
    }

    if (variance === 0) {
        return `On ${label}`;
    }
    const magnitude = Math.abs(variance);
    const text = asPercent
        ? formatNumber(magnitude, { mode: "percent", displayUnits: "none", decimals: 1, thousandsSeparator: true, locale })
        : formatters.header(magnitude, data.bound.targetVariance ? "targetVariance" : "targetValue", t.targetDisplayUnits);
    return `${text} ${variance < 0 ? "below" : "above"} ${label}`;
}

function buildCaption(data: TileData, settings: TileSettings): string | null {
    const c = settings.chart;
    const count = data.periods.length;
    if (!c.captionShow || count === 0) {
        return null;
    }
    if (c.captionText.trim() !== "") {
        return c.captionText.replace(/\{count\}/gi, String(count));
    }
    const base = periodCountCaption(count, data.granularity);
    if (c.previousYearShow && data.bound.previousYearValue) {
        // "4 quarters" -> "4 quarter pairs"
        const unit = base.replace(/^\d+\s+/, "").replace(/s$/, "");
        return `${count} ${unit} pair${count === 1 ? "" : "s"}`;
    }
    return base;
}

export function buildView(data: TileData, settings: TileSettings, status: StatusResult, locale?: string): TileView {
    const formatters = createFormatters(data, settings, locale);
    const reference = data.reference;
    const h = settings.header;
    const mv = settings.mainValue;

    const technicalName = h.technicalNameShow ? (reference?.technicalName ?? (h.technicalNameText.trim() || null)) : null;
    const category = h.categoryShow ? (reference?.category ?? (h.categoryText.trim() || null)) : null;
    const title = h.titleShow ? (reference?.title ?? (h.titleText.trim() || data.names.primaryValue || null)) : null;
    const subtitle = h.subtitleShow ? (reference?.subtitle ?? (h.subtitleText.trim() || null)) : null;

    // ---- main value (spec 7.3)
    const current = headerValue(reference);
    let primaryState: TileView["primaryState"] = "value";
    let primaryText: string;
    if (data.invalidPrimary && current.value === null) {
        primaryState = "error";
        primaryText = MESSAGES.invalidValue;
    } else if (current.value === null) {
        primaryState = "noData";
        primaryText = mv.noDataText || "No data";
    } else {
        primaryText = formatters.header(current.value, current.role);
    }
    const primaryName = (current.role === "secondaryValue" ? data.names.secondaryValue : data.names.primaryValue) ?? "Value";

    // ---- secondary value: hidden when it has been promoted
    let secondaryText: string | null = null;
    let secondaryLabel: string | null = null;
    let secondaryValueText: string | null = null;
    if (mv.secondaryShow && reference && reference.secondary !== null && !data.secondaryPromoted) {
        secondaryLabel = reference.secondaryLabel ?? (mv.secondaryLabel.trim() || null);
        secondaryValueText = formatters.header(reference.secondary, "secondaryValue", mv.secondaryDisplayUnits);
        secondaryText = secondaryLabel ? `${secondaryLabel}: ${secondaryValueText}` : secondaryValueText;
    }

    // ---- target (spec 8): the line disappears when there is no target
    let targetText: string | null = null;
    let targetValueText: string | null = null;
    if (settings.target.targetShow && reference && reference.target !== null) {
        targetValueText = formatters.header(reference.target, "targetValue", settings.target.targetDisplayUnits);
        targetText = `${settings.target.targetLabel} ${targetValueText}`.trim();
    }
    const varianceText = buildVariance(data, settings, formatters, locale);

    const comparison1 = buildComparison(1, data, settings, locale);
    const comparison2 = buildComparison(2, data, settings, locale);

    // ---- chart area
    let chartMessage: string | null = null;
    if (!data.bound.period) {
        chartMessage = MESSAGES.noPeriod;
    } else if (data.periods.length === 0 || data.periods.every(p => p.chartActual === null && p.previousYear === null && p.chartRemaining === 0)) {
        chartMessage = MESSAGES.noHistory;
    }

    // ---- accessible summary
    const parts: string[] = [];
    if (primaryState === "value") {
        parts.push(`${primaryName}: ${primaryText}`);
    } else {
        parts.push(primaryText);
    }
    if (reference && data.bound.period) {
        parts.push(`Period: ${reference.labels.full}${reference.isOpen ? ` (${MESSAGES.inProgress.toLowerCase()})` : ""}`);
    }
    if (secondaryText) {
        parts.push(secondaryText);
    }
    if (targetText) {
        parts.push(targetText);
    }
    if (varianceText) {
        parts.push(varianceText);
    }
    if (status.visible && status.label) {
        parts.push(`Status: ${status.label}`);
    }
    for (const comparison of [comparison1, comparison2]) {
        if (comparison.visible) {
            parts.push(comparison.settings.labelPlacement === "before"
                ? `${comparison.label} ${comparison.valueText}`
                : `${comparison.valueText} ${comparison.label}`);
        }
    }
    const a11y = settings.accessibility;
    const ariaLabel = a11y.a11yTitle.trim() || [technicalName, title].filter(Boolean).join(" - ") || "KPI Performance Tile";
    const ariaDescription = a11y.a11yDescription.trim() || parts.join(". ");

    return {
        technicalName,
        category,
        title,
        subtitle,
        primaryState,
        primaryText,
        primaryName,
        secondaryText,
        secondaryLabel,
        secondaryValueText,
        targetText,
        targetValueText,
        varianceText,
        status,
        comparison1,
        comparison2,
        caption: buildCaption(data, settings),
        chartMessage,
        actionUrl: reference?.actionUrl ?? (settings.interaction.staticUrl.trim() || null),
        ariaLabel,
        ariaDescription
    };
}
