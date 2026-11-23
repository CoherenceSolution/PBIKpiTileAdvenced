/** Builds a minimal categorical dataView for unit tests (same shape as the one sent by Power BI). */
import type powerbi from "powerbi-visuals-api";

import { RoleName } from "../src/roles";

export interface TestRow {
    period?: unknown;
    sortKey?: unknown;
    [role: string]: unknown;
}

export interface TestOptions {
    formats?: Partial<Record<RoleName, string>>;
    names?: Partial<Record<RoleName, string>>;
    highlights?: Partial<Record<RoleName, Array<number | null>>>;
    noPeriod?: boolean;
    tooltips?: Array<{ name: string; values: unknown[] }>;
}

export function dataView(rows: TestRow[], options: TestOptions = {}): powerbi.DataView {
    const categories: unknown[] = [];
    if (!options.noPeriod) {
        categories.push({ source: { displayName: "Period", roles: { period: true } }, values: rows.map(r => r.period) });
        if (rows.some(r => r.sortKey !== undefined)) {
            categories.push({ source: { displayName: "Sort", roles: { periodSortKey: true } }, values: rows.map(r => r.sortKey) });
        }
    }
    const roles = new Set<string>();
    rows.forEach(r => Object.keys(r).forEach(k => { if (k !== "period" && k !== "sortKey") { roles.add(k); } }));
    const values: unknown[] = Array.from(roles).map(role => ({
        source: {
            displayName: options.names?.[role as RoleName] ?? role,
            roles: { [role]: true },
            format: options.formats?.[role as RoleName]
        },
        values: rows.map(r => (r[role] === undefined ? null : r[role])),
        highlights: options.highlights?.[role as RoleName]
    }));
    (options.tooltips ?? []).forEach(t => values.push({ source: { displayName: t.name, roles: { tooltips: true } }, values: t.values }));
    return { metadata: { columns: [] }, categorical: { categories, values } } as unknown as powerbi.DataView;
}

export const QUARTERS: TestRow[] = [
    { period: "Q4 2025", actualValue: 1180, previousYearValue: 1070, primaryValue: 1180, targetValue: 1000, comparison1Value: 0.04, comparison2Value: 0.103, isCurrentPeriod: 0 },
    { period: "Q1 2026", actualValue: 1275, previousYearValue: 1065, primaryValue: 1275, targetValue: 1000, comparison1Value: 0.081, comparison2Value: 0.197, isCurrentPeriod: 0 },
    { period: "Q2 2026", actualValue: 1507, previousYearValue: 1240, primaryValue: 1507, targetValue: 1000, comparison1Value: 0.182, comparison2Value: 0.215, isCurrentPeriod: 0 },
    { period: "Q3 2026", actualValue: 975, projectedValue: 1420, projectionRemaining: 445, previousYearValue: 1236, primaryValue: 975, targetValue: 1000, comparison1Value: -0.353, comparison2Value: -0.211, isCurrentPeriod: 1 }
];

export const QUARTER_FORMATS: Partial<Record<RoleName, string>> = {
    primaryValue: "#,0", targetValue: "#,0", comparison1Value: "0.0%", comparison2Value: "0.0%"
};

export function rows(patch: (row: TestRow, index: number) => TestRow | void): TestRow[] {
    return QUARTERS.map((row, index) => {
        const copy = { ...row };
        return patch(copy, index) ?? copy;
    });
}
