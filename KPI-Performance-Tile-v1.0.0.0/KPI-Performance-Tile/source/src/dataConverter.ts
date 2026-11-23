/**
 * Converts the Power BI categorical dataView into the view model of the tile.
 * Pure module: no DOM, no host service. Business calculations stay in DAX; the converter
 * only sanitises (e.g. never a negative remaining projection) and applies display fallbacks.
 */
import type powerbi from "powerbi-visuals-api";

import { ParsedPeriod, formatPeriodLabel, parsePeriod, resolveGranularity } from "./periods";
import { RoleName } from "./roles";
import { TileSettings } from "./settingsSchema";
import { PeriodPoint, TileData, TooltipField } from "./types";

type ValueColumn = powerbi.DataViewValueColumn;

export interface ConvertOptions {
    /** Formats a raw category value (typically a date) with the format string of its column. */
    formatRaw?: (value: unknown, format: string | undefined) => string;
    /** Row indexes currently selected in the chart (used by the "Selected bar" header period). */
    selectedRows?: ReadonlySet<number>;
}

export const WARNINGS = {
    missingPrimary: "Primary Value is required: add a measure to the Primary Value field.",
    invalidPrimary: "Primary Value is not a number.",
    unsortable: "Periods cannot be sorted chronologically, the order of the field is used. Add a Period Sort Key or use a date column.",
    duplicates: "Several rows share the same period. The visual expects one aggregated row per period.",
    multipleCurrent: "Is Current Period is true for several periods. The most recent one is used.",
    daily: "Period looks like a daily date. Provide one row per month, quarter or year.",
    mixedGranularity: "Periods mix several granularities. Set Period granularity manually or use a consistent column."
} as const;

function defaultFormatRaw(value: unknown): string {
    if (value === null || value === undefined || value === "") {
        return "(Blank)";
    }
    if (value instanceof Date) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return String(value);
}

interface NumberRead { value: number | null; invalid: boolean }

function readNumber(raw: unknown): NumberRead {
    if (raw === null || raw === undefined || raw === "") {
        return { value: null, invalid: false };
    }
    if (typeof raw === "number") {
        return Number.isFinite(raw) ? { value: raw, invalid: false } : { value: null, invalid: true };
    }
    if (typeof raw === "string") {
        const text = raw.trim();
        if (text === "") {
            return { value: null, invalid: false };
        }
        const parsed = Number(text);
        return Number.isFinite(parsed) ? { value: parsed, invalid: false } : { value: null, invalid: true };
    }
    if (typeof raw === "boolean") {
        return { value: raw ? 1 : 0, invalid: false };
    }
    return { value: null, invalid: true };
}

function readText(raw: unknown, formatRaw: (value: unknown, format: string | undefined) => string, format?: string): string | null {
    if (raw === null || raw === undefined) {
        return null;
    }
    if (typeof raw === "string") {
        const text = raw.trim();
        return text === "" ? null : text;
    }
    if (raw instanceof Date) {
        return formatRaw(raw, format);
    }
    return String(raw);
}

function readBoolean(raw: unknown): boolean {
    if (typeof raw === "boolean") {
        return raw;
    }
    if (typeof raw === "number") {
        return raw !== 0 && !Number.isNaN(raw);
    }
    if (typeof raw === "string") {
        return ["1", "true", "yes", "y", "oui", "ja"].includes(raw.trim().toLowerCase());
    }
    return false;
}

function readSortKey(raw: unknown): number | null {
    if (raw instanceof Date) {
        const time = raw.getTime();
        return Number.isNaN(time) ? null : time;
    }
    if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : null;
    }
    if (typeof raw === "string" && raw.trim() !== "") {
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        return parsePeriod(raw)?.time ?? null;
    }
    return null;
}

function emptyData(): TileData {
    return {
        hasData: false,
        periods: [],
        reference: null,
        granularity: "unknown",
        bound: {},
        formats: {},
        names: {},
        warnings: [],
        hasHighlights: false,
        totalPeriods: 0,
        secondaryPromoted: false,
        invalidPrimary: false
    };
}

export function convert(dataView: powerbi.DataView | undefined | null, settings: TileSettings, options: ConvertOptions = {}): TileData {
    const formatRaw = options.formatRaw ?? defaultFormatRaw;
    const categorical = dataView?.categorical;
    const categories = categorical?.categories ?? [];
    const valueColumns: ValueColumn[] = categorical?.values ? Array.from(categorical.values) : [];

    const data = emptyData();
    if (categories.length === 0 && valueColumns.length === 0) {
        return data;
    }
    data.hasData = true;

    // ------------------------------------------------------------ columns by role
    const periodColumn = categories.find(c => c.source?.roles?.["period"]) ?? categories.find(c => c.source?.roles?.["periodSortKey"]);
    const sortColumn = categories.find(c => c.source?.roles?.["periodSortKey"]);
    const roleColumns: Partial<Record<RoleName, ValueColumn>> = {};
    const tooltipColumns: ValueColumn[] = [];

    for (const column of valueColumns) {
        const roles = column.source?.roles ?? {};
        for (const role of Object.keys(roles) as RoleName[]) {
            if (!roles[role]) {
                continue;
            }
            if (role === "tooltips") {
                tooltipColumns.push(column);
            } else if (!roleColumns[role]) {
                roleColumns[role] = column;
            }
        }
    }

    if (categories.some(c => c.source?.roles?.["period"])) {
        data.bound.period = true;
    }
    if (sortColumn) {
        data.bound.periodSortKey = true;
    }
    for (const role of Object.keys(roleColumns) as RoleName[]) {
        data.bound[role] = true;
        data.formats[role] = roleColumns[role]?.source?.format;
        data.names[role] = roleColumns[role]?.source?.displayName;
    }
    if (tooltipColumns.length > 0) {
        data.bound.tooltips = true;
    }

    const hasHighlights = valueColumns.some(c => Array.isArray(c.highlights));
    data.hasHighlights = hasHighlights;

    const rowCount = periodColumn
        ? periodColumn.values.length
        : valueColumns.reduce((max, c) => Math.max(max, c.values?.length ?? 0), 0);

    /** Business value: follows cross-highlighting. */
    const business = (role: RoleName, row: number): unknown => {
        const column = roleColumns[role];
        if (!column) {
            return undefined;
        }
        if (hasHighlights && Array.isArray(column.highlights)) {
            return column.highlights[row];
        }
        return column.values[row];
    };
    /** Descriptive value (labels, flags): never affected by cross-highlighting. */
    const base = (role: RoleName, row: number): unknown => roleColumns[role]?.values[row];

    // ------------------------------------------------------------ rows
    const isCurrentBound = !!roleColumns.isCurrentPeriod;
    const actualBound = !!roleColumns.actualValue;
    let anyInvalidPrimary = false;
    const invalidPrimaryRows = new Set<number>();

    const rows: PeriodPoint[] = [];
    for (let row = 0; row < rowCount; row++) {
        const raw = periodColumn ? periodColumn.values[row] : null;
        const parsed: ParsedPeriod | null = periodColumn ? parsePeriod(raw) : null;
        const providedLabel = periodColumn ? formatRaw(raw, periodColumn.source?.format) : "";
        const sortKey = sortColumn ? readSortKey(sortColumn.values[row]) : (parsed ? parsed.time : null);

        const primaryRead = readNumber(business("primaryValue", row));
        if (primaryRead.invalid) {
            anyInvalidPrimary = true;
            invalidPrimaryRows.add(row);
        }
        const primary = primaryRead.value;
        const secondary = readNumber(business("secondaryValue", row)).value;
        const actual = readNumber(business("actualValue", row)).value;
        const projected = readNumber(business("projectedValue", row)).value;
        const remainingRaw = readNumber(business("projectionRemaining", row)).value;
        const previousYear = readNumber(business("previousYearValue", row)).value;

        const comparison1Raw = business("comparison1Value", row);
        const comparison2Raw = business("comparison2Value", row);
        const comparison1 = typeof comparison1Raw === "string" ? null : readNumber(comparison1Raw).value;
        const comparison2 = typeof comparison2Raw === "string" ? null : readNumber(comparison2Raw).value;

        const isCurrent = isCurrentBound ? readBoolean(base("isCurrentPeriod", row)) : false;
        const projectionOnly = actualBound && actual === null && projected !== null;
        const isOpen = isCurrentBound ? isCurrent : ((remainingRaw ?? 0) > 0 || projectionOnly);

        let chartRemaining = 0;
        if (settings.chart.projectionShow && isOpen) {
            if (roleColumns.projectionRemaining) {
                chartRemaining = remainingRaw ?? 0;
            } else if (roleColumns.projectedValue && actualBound && projected !== null) {
                chartRemaining = actual === null ? projected : projected - actual;
            }
            if (projectionOnly && chartRemaining <= 0 && projected !== null) {
                chartRemaining = projected;
            }
            if (!(chartRemaining > 0)) {
                chartRemaining = 0; // never a negative segment
            }
        }

        const tooltipFields: TooltipField[] = tooltipColumns.map(column => ({
            displayName: column.source?.displayName ?? "",
            value: hasHighlights && Array.isArray(column.highlights) ? column.highlights[row] : column.values[row],
            format: column.source?.format
        }));

        rows.push({
            rowIndex: row,
            raw,
            parsed,
            sortKey,
            providedLabel,
            labels: { full: providedLabel, short: providedLabel, tiny: providedLabel },
            primary,
            secondary,
            actual,
            projected,
            previousYear,
            target: readNumber(business("targetValue", row)).value,
            targetVariance: readNumber(business("targetVariance", row)).value,
            comparison1,
            comparison1Text: typeof comparison1Raw === "string" ? readText(comparison1Raw, formatRaw) : null,
            comparison2,
            comparison2Text: typeof comparison2Raw === "string" ? readText(comparison2Raw, formatRaw) : null,
            statusValue: readNumber(business("statusValue", row)).value,
            statusCode: readText(business("statusCode", row), formatRaw),
            statusLabel: readText(business("statusLabel", row), formatRaw),
            secondaryLabel: readText(base("secondaryLabel", row), formatRaw),
            comparison1Label: readText(base("comparison1Label", row), formatRaw),
            comparison2Label: readText(base("comparison2Label", row), formatRaw),
            technicalName: readText(base("kpiTechnicalName", row), formatRaw),
            title: readText(base("kpiTitle", row), formatRaw),
            subtitle: readText(base("kpiSubtitle", row), formatRaw),
            category: readText(base("kpiCategory", row), formatRaw),
            actionUrl: readText(base("actionUrl", row), formatRaw),
            isCurrent,
            isOpen,
            chartActual: actualBound ? actual : primary,
            chartRemaining,
            chartGhost: hasHighlights ? readNumber(base(actualBound ? "actualValue" : "primaryValue", row)).value : null,
            projectionBelowActual: projected !== null && actual !== null && projected < actual,
            tooltipFields
        });
    }
    data.totalPeriods = rows.length;

    // ------------------------------------------------------------ granularity and labels
    const granularity = periodColumn ? resolveGranularity(settings.chart.granularity, rows.map(r => r.parsed)) : "unknown";
    data.granularity = granularity;
    if (settings.chart.periodLabelFormat === "auto") {
        for (const row of rows) {
            row.labels = {
                full: formatPeriodLabel(row.parsed, granularity, "full") ?? row.providedLabel,
                short: formatPeriodLabel(row.parsed, granularity, "short") ?? row.providedLabel,
                tiny: formatPeriodLabel(row.parsed, granularity, "tiny") ?? row.providedLabel
            };
        }
    }

    // ------------------------------------------------------------ order, most recent X periods
    const sortable = rows.length > 0 && rows.every(r => r.sortKey !== null);
    const chronological = rows.slice();
    if (sortable) {
        chronological.sort((a, b) => (a.sortKey as number) - (b.sortKey as number) || a.rowIndex - b.rowIndex);
    } else if (settings.chart.sort !== "provided" && rows.length > 1) {
        data.warnings.push(WARNINGS.unsortable);
    }

    // Future periods holding only a target (or nothing) do not belong to the history.
    const hasChartData = (p: PeriodPoint) => p.chartActual !== null || p.projected !== null || p.primary !== null || p.secondary !== null || p.isCurrent;
    while (chronological.length > 1 && !hasChartData(chronological[chronological.length - 1])) {
        chronological.pop();
    }

    // Without an Is Current Period flag, the most recent period is considered open when its
    // projection exceeds its actual.
    const latest = chronological[chronological.length - 1];
    if (latest && !isCurrentBound && actualBound && !roleColumns.projectionRemaining && settings.chart.projectionShow
        && latest.projected !== null && latest.actual !== null && latest.projected > latest.actual) {
        latest.isOpen = true;
        latest.chartRemaining = latest.projected - latest.actual;
    }

    const limit = Math.max(1, Math.round(settings.chart.periods));
    const window = chronological.slice(Math.max(0, chronological.length - limit));

    let display: PeriodPoint[];
    if (settings.chart.sort === "desc") {
        display = window.slice().reverse();
    } else if (settings.chart.sort === "provided") {
        const kept = new Set(window);
        display = rows.filter(r => kept.has(r));
    } else {
        display = window;
    }
    data.periods = periodColumn ? display : [];

    // ------------------------------------------------------------ reference period (header)
    const currents = settings.chart.headerPeriod === "latest" ? [] : window.filter(p => p.isCurrent);
    let reference: PeriodPoint | null = null;
    const selected = settings.chart.headerPeriod === "selected" && options.selectedRows
        ? window.filter(p => options.selectedRows?.has(p.rowIndex))
        : [];
    if (selected.length === 1) {
        reference = selected[0];
    } else if (currents.length > 0) {
        reference = currents[currents.length - 1];
    } else {
        for (let i = window.length - 1; i >= 0; i--) {
            if (window[i].primary !== null || window[i].secondary !== null) {
                reference = window[i];
                break;
            }
        }
        reference = reference ?? window[window.length - 1] ?? null;
    }
    data.reference = reference;
    data.secondaryPromoted = !!reference && reference.primary === null && reference.secondary !== null;
    data.invalidPrimary = !!reference && invalidPrimaryRows.has(reference.rowIndex);

    // ------------------------------------------------------------ non-blocking warnings
    if (!roleColumns.primaryValue) {
        data.warnings.push(WARNINGS.missingPrimary);
    }
    if (anyInvalidPrimary) {
        data.warnings.push(WARNINGS.invalidPrimary);
    }
    if (rows.filter(r => r.isCurrent).length > 1) {
        data.warnings.push(WARNINGS.multipleCurrent);
    }
    if (periodColumn) {
        const seen = new Set<string>();
        let duplicates = false;
        for (const row of rows) {
            const key = sortable ? String(row.sortKey) : row.providedLabel;
            if (seen.has(key)) {
                duplicates = true;
                break;
            }
            seen.add(key);
        }
        if (duplicates) {
            data.warnings.push(WARNINGS.duplicates);
        }
        if (granularity === "day") {
            data.warnings.push(WARNINGS.daily);
        }
        const hints = new Set(rows.map(r => r.parsed?.hint).filter(h => h && h !== "day"));
        if (settings.chart.granularity === "auto" && hints.size > 1) {
            data.warnings.push(WARNINGS.mixedGranularity);
        }
    }

    return data;
}
