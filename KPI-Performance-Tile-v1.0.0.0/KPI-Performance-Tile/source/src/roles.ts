/**
 * Data roles of the visual — single source of truth.
 * capabilities.json is generated from this file (npm run generate).
 */

export interface RoleDef {
    name: string;
    displayName: string;
    kind: "Grouping" | "Measure";
    description: string;
    /** Maximum number of fields accepted in the role. */
    max: number;
}

export const ROLES = [
    { name: "period", displayName: "Period", kind: "Grouping", max: 1, description: "Required. One row per period: a date, or a text/number such as 2026-01, Q1 2026, 2026." },
    { name: "periodSortKey", displayName: "Period Sort Key", kind: "Grouping", max: 1, description: "Optional numeric or date key (e.g. 202601) from the same table as Period, used for chronological sorting." },
    { name: "primaryValue", displayName: "Primary Value", kind: "Measure", max: 1, description: "Required. Main figure of the tile (Actual, Projected or any business measure)." },
    { name: "secondaryValue", displayName: "Secondary Value", kind: "Measure", max: 1, description: "Optional smaller figure shown under the primary value." },
    { name: "secondaryLabel", displayName: "Secondary Value Label", kind: "Measure", max: 1, description: "Optional text measure for the secondary value label (e.g. Actual)." },
    { name: "actualValue", displayName: "Actual Value", kind: "Measure", max: 1, description: "Recommended. Realised value per period, drawn as the main bar." },
    { name: "projectedValue", displayName: "Projected Value", kind: "Measure", max: 1, description: "Optional projected total for the open period." },
    { name: "projectionRemaining", displayName: "Projection Remaining", kind: "Measure", max: 1, description: "Optional. MAX(0, Projected - Actual), stacked on top of Actual for the open period." },
    { name: "previousYearValue", displayName: "Previous Year Value", kind: "Measure", max: 1, description: "Recommended. Same period of the previous year." },
    { name: "targetValue", displayName: "Target Value", kind: "Measure", max: 1, description: "Optional target." },
    { name: "targetVariance", displayName: "Target Variance", kind: "Measure", max: 1, description: "Optional variance to target (absolute or %), shown when 'Show target variance' is on." },
    { name: "comparison1Value", displayName: "Comparison 1 Value", kind: "Measure", max: 1, description: "Optional first variance (e.g. vs previous period). Number or prepared text." },
    { name: "comparison1Label", displayName: "Comparison 1 Label", kind: "Measure", max: 1, description: "Optional text measure for the first comparison label." },
    { name: "comparison2Value", displayName: "Comparison 2 Value", kind: "Measure", max: 1, description: "Optional second variance (e.g. vs same period last year). Number or prepared text." },
    { name: "comparison2Label", displayName: "Comparison 2 Label", kind: "Measure", max: 1, description: "Optional text measure for the second comparison label." },
    { name: "statusValue", displayName: "Status Value", kind: "Measure", max: 1, description: "Optional value compared with the badge thresholds (e.g. variance to target, -0.03 = -3%)." },
    { name: "statusCode", displayName: "Status Code", kind: "Measure", max: 1, description: "Optional text measure: ON_TARGET, NEAR_TARGET, BELOW_TARGET, ABOVE_TARGET, NO_TARGET, NO_DATA, CUSTOM." },
    { name: "statusLabel", displayName: "Status Label", kind: "Measure", max: 1, description: "Optional text measure overriding the badge text." },
    { name: "isCurrentPeriod", displayName: "Is Current Period", kind: "Measure", max: 1, description: "Recommended. 1/TRUE for the open (in progress) period, 0/FALSE otherwise." },
    { name: "kpiTechnicalName", displayName: "KPI Technical Name", kind: "Measure", max: 1, description: "Optional text measure, e.g. RET-001." },
    { name: "kpiTitle", displayName: "KPI Title", kind: "Measure", max: 1, description: "Optional text measure for the title." },
    { name: "kpiSubtitle", displayName: "KPI Subtitle", kind: "Measure", max: 1, description: "Optional text measure for the subtitle." },
    { name: "kpiCategory", displayName: "KPI Category", kind: "Measure", max: 1, description: "Optional text measure for the category shown top right." },
    { name: "actionUrl", displayName: "Action URL", kind: "Measure", max: 1, description: "Optional text measure returning an https:// URL used by the 'Open URL' actions." },
    { name: "tooltips", displayName: "Tooltip Fields", kind: "Measure", max: 10, description: "Optional additional measures displayed in tooltips." }
] as const satisfies ReadonlyArray<RoleDef>;

export type RoleName = (typeof ROLES)[number]["name"];

/** Roles whose value is numeric business data (highlight-aware). */
export const NUMERIC_ROLES: ReadonlyArray<RoleName> = [
    "primaryValue", "secondaryValue", "actualValue", "projectedValue", "projectionRemaining",
    "previousYearValue", "targetValue", "targetVariance", "statusValue"
];
