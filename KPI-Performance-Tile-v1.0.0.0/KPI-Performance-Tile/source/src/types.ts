import { Granularity, ParsedPeriod } from "./periods";
import { RoleName } from "./roles";

export interface TooltipField {
    displayName: string;
    value: unknown;
    format?: string;
}

/** One logical row = one period. */
export interface PeriodPoint {
    /** Row index in the dataView (used to build the selection identity). */
    rowIndex: number;
    raw: unknown;
    parsed: ParsedPeriod | null;
    sortKey: number | null;
    /** Label as provided by the model (dates formatted with the column format). */
    providedLabel: string;
    /** Compact labels by decreasing length; equal to providedLabel when the period cannot be parsed. */
    labels: { full: string; short: string; tiny: string };

    primary: number | null;
    secondary: number | null;
    actual: number | null;
    projected: number | null;
    previousYear: number | null;
    target: number | null;
    targetVariance: number | null;
    comparison1: number | null;
    comparison1Text: string | null;
    comparison2: number | null;
    comparison2Text: string | null;
    statusValue: number | null;
    statusCode: string | null;
    statusLabel: string | null;

    secondaryLabel: string | null;
    comparison1Label: string | null;
    comparison2Label: string | null;
    technicalName: string | null;
    title: string | null;
    subtitle: string | null;
    category: string | null;
    actionUrl: string | null;

    /** True when the period is flagged as current by the model. */
    isCurrent: boolean;
    /** True when the period is open: projection may be drawn. */
    isOpen: boolean;

    // ---- chart series (already sanitised: never negative remaining, etc.)
    /** Solid bar. Falls back to Primary Value when no Actual Value field is bound. */
    chartActual: number | null;
    /** Hatched segment stacked on the actual bar (>= 0). */
    chartRemaining: number;
    /** Un-highlighted actual drawn as a ghost bar during cross-highlighting. */
    chartGhost: number | null;
    /** True when the projection is lower than the actual (reported in the tooltip). */
    projectionBelowActual: boolean;

    tooltipFields: TooltipField[];
}

export interface TileData {
    /** False when no field at all is bound: the landing page is shown. */
    hasData: boolean;
    /** Periods in display order (already limited to the configured number). */
    periods: PeriodPoint[];
    /** Period feeding the header (value, target, badge, comparisons). */
    reference: PeriodPoint | null;
    granularity: Granularity;
    /** Roles that have a field bound. */
    bound: Partial<Record<RoleName, boolean>>;
    /** Format string of the measure bound to each role. */
    formats: Partial<Record<RoleName, string | undefined>>;
    /** Display name of the measure bound to each role. */
    names: Partial<Record<RoleName, string | undefined>>;
    warnings: string[];
    hasHighlights: boolean;
    /** Number of periods received before limiting. */
    totalPeriods: number;
    /** True when Primary Value was empty and Secondary Value was promoted in its place. */
    secondaryPromoted: boolean;
    /** True when the header value is not a number. */
    invalidPrimary: boolean;
}

export type StatusCode = "ON_TARGET" | "NEAR_TARGET" | "BELOW_TARGET" | "ABOVE_TARGET" | "NO_TARGET" | "NO_DATA" | "CUSTOM";

export interface StatusResult {
    code: StatusCode;
    /** Style bucket used for icon and colors. */
    state: "onTarget" | "nearTarget" | "belowTarget" | "aboveTarget" | "noTarget" | "noData" | "custom";
    label: string;
    visible: boolean;
}

export type LayoutMode = "minimal" | "compact" | "standard" | "large";
