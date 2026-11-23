import { describe, expect, it } from "vitest";

import { WARNINGS, convert } from "../src/dataConverter";
import { defaultSettings, resolveSettings } from "../src/settingsResolver";
import { QUARTERS, dataView, rows } from "./helpers";

const settings = defaultSettings();
const withChart = (chart: Record<string, unknown>) => resolveSettings({ chart });

describe("convert - structure", () => {
    it("returns hasData = false when nothing is bound (landing page)", () => {
        expect(convert(undefined, settings).hasData).toBe(false);
        expect(convert({ metadata: { columns: [] } } as never, settings).hasData).toBe(false);
    });

    it("builds one point per period, in chronological order", () => {
        const shuffled = [QUARTERS[2], QUARTERS[0], QUARTERS[3], QUARTERS[1]];
        const data = convert(dataView(shuffled), settings);
        expect(data.periods.map(p => p.labels.full)).toEqual(["Q4 '25", "Q1 '26", "Q2 '26", "Q3 '26"]);
        expect(data.granularity).toBe("quarter");
        expect(data.warnings).toEqual([]);
    });

    it("keeps the X most recent periods (12 by default)", () => {
        const months = Array.from({ length: 30 }, (_, i) => ({ period: new Date(2024, i, 1), primaryValue: i }));
        expect(convert(dataView(months), settings).periods).toHaveLength(12);
        const data = convert(dataView(months), withChart({ periods: 5 }));
        expect(data.periods.map(p => p.primary)).toEqual([25, 26, 27, 28, 29]);
        expect(data.totalPeriods).toBe(30);
        expect(convert(dataView(months), withChart({ periods: 99 })).periods).toHaveLength(30); // clamped to 36
    });

    it("sorts descending or keeps the order of the field", () => {
        const shuffled = [QUARTERS[2], QUARTERS[0], QUARTERS[3], QUARTERS[1]];
        expect(convert(dataView(QUARTERS), withChart({ sort: "desc" })).periods.map(p => p.labels.short)).toEqual(["Q3", "Q2", "Q1", "Q4"]);
        expect(convert(dataView(shuffled), withChart({ sort: "provided" })).periods.map(p => p.labels.short)).toEqual(["Q2", "Q4", "Q3", "Q1"]);
    });

    it("uses the Period Sort Key when periods are free text", () => {
        const free = [
            { period: "Third", sortKey: 3, primaryValue: 30 },
            { period: "First", sortKey: 1, primaryValue: 10 },
            { period: "Second", sortKey: 2, primaryValue: 20 }
        ];
        const data = convert(dataView(free), settings);
        expect(data.periods.map(p => p.providedLabel)).toEqual(["First", "Second", "Third"]);
        expect(data.warnings).toEqual([]);
    });

    it("warns when periods cannot be sorted, without blocking", () => {
        const data = convert(dataView([{ period: "B", primaryValue: 1 }, { period: "A", primaryValue: 2 }]), settings);
        expect(data.warnings).toContain(WARNINGS.unsortable);
        expect(data.periods.map(p => p.providedLabel)).toEqual(["B", "A"]);
    });
});

describe("convert - header period", () => {
    it("is the current period when flagged", () => {
        const data = convert(dataView(rows((r, i) => { r.isCurrentPeriod = i === 2 ? 1 : 0; })), settings);
        expect(data.reference?.labels.full).toBe("Q2 '26");
    });

    it("falls back to the most recent period", () => {
        const data = convert(dataView(rows(r => { delete r.isCurrentPeriod; })), settings);
        expect(data.reference?.labels.full).toBe("Q3 '26");
    });

    it("can be forced to the latest period or follow the selection", () => {
        const flagged = dataView(rows((r, i) => { r.isCurrentPeriod = i === 1 ? 1 : 0; }));
        expect(convert(flagged, withChart({ headerPeriod: "latest" })).reference?.labels.full).toBe("Q3 '26");
        expect(convert(flagged, withChart({ headerPeriod: "selected" }), { selectedRows: new Set([0]) }).reference?.labels.full).toBe("Q4 '25");
        expect(convert(flagged, withChart({ headerPeriod: "selected" }), { selectedRows: new Set() }).reference?.labels.full).toBe("Q1 '26");
    });

    it("ignores future periods that only hold a target", () => {
        const future = QUARTERS.concat([{ period: "Q4 2026", targetValue: 1000 }]);
        const data = convert(dataView(future), settings);
        expect(data.periods).toHaveLength(4);
        expect(data.reference?.labels.full).toBe("Q3 '26");
    });
});

describe("convert - missing values (spec 7.3)", () => {
    it("treats zero as a value", () => {
        const data = convert(dataView(rows(r => { r.primaryValue = 0; })), settings);
        expect(data.reference?.primary).toBe(0);
        expect(data.secondaryPromoted).toBe(false);
    });

    it("promotes Secondary when Primary is empty", () => {
        const data = convert(dataView(rows(r => { r.primaryValue = null; r.secondaryValue = 842; })), settings);
        expect(data.secondaryPromoted).toBe(true);
    });

    it("flags a non numeric Primary Value", () => {
        const data = convert(dataView(rows(r => { r.primaryValue = "abc"; })), settings);
        expect(data.invalidPrimary).toBe(true);
        expect(data.warnings).toContain(WARNINGS.invalidPrimary);
    });

    it("warns when Primary Value is not bound", () => {
        const data = convert(dataView(rows(r => { delete r.primaryValue; })), settings);
        expect(data.warnings).toContain(WARNINGS.missingPrimary);
    });
});

describe("convert - projection (spec 13)", () => {
    const open = (data: ReturnType<typeof convert>) => data.periods[data.periods.length - 1];

    it("stacks Projection Remaining on the open period only", () => {
        const data = convert(dataView(rows(r => { r.projectionRemaining = 100; })), settings);
        expect(data.periods.map(p => p.chartRemaining)).toEqual([0, 0, 0, 100]);
    });

    it("derives the remaining part from Projected - Actual when no measure is given", () => {
        const data = convert(dataView(rows(r => { delete r.projectionRemaining; })), settings);
        expect(open(data).chartRemaining).toBe(445);
    });

    it("never produces a negative segment (projection below actual)", () => {
        const data = convert(dataView(rows((r, i) => { if (i === 3) { r.projectedValue = 900; r.projectionRemaining = -75; } })), settings);
        expect(open(data).chartRemaining).toBe(0);
        expect(open(data).projectionBelowActual).toBe(true);
    });

    it("shows nothing when projection equals actual or is empty", () => {
        expect(open(convert(dataView(rows((r, i) => { if (i === 3) { r.projectedValue = 975; r.projectionRemaining = 0; } })), settings)).chartRemaining).toBe(0);
        expect(open(convert(dataView(rows(r => { delete r.projectedValue; delete r.projectionRemaining; })), settings)).chartRemaining).toBe(0);
    });

    it("draws the projection alone when Actual is empty", () => {
        const data = convert(dataView(rows((r, i) => { if (i === 3) { r.actualValue = null; delete r.projectionRemaining; } })), settings);
        expect(open(data).chartActual).toBeNull();
        expect(open(data).chartRemaining).toBe(1420);
    });

    it("does not draw the projection of a closed period", () => {
        const data = convert(dataView(rows(r => { r.isCurrentPeriod = 0; r.projectedValue = 2000; r.projectionRemaining = 500; })), settings);
        expect(data.periods.every(p => p.chartRemaining === 0)).toBe(true);
    });

    it("can be switched off", () => {
        const data = convert(dataView(QUARTERS), withChart({ projectionShow: false }));
        expect(data.periods.every(p => p.chartRemaining === 0)).toBe(true);
    });

    it("falls back to Primary Value for the bars when Actual Value is not bound", () => {
        const data = convert(dataView(rows(r => { delete r.actualValue; })), settings);
        expect(data.periods.map(p => p.chartActual)).toEqual([1180, 1275, 1507, 975]);
    });
});

describe("convert - inconsistent data (spec 23.8)", () => {
    it("warns about duplicate periods", () => {
        const data = convert(dataView(QUARTERS.concat([{ ...QUARTERS[1] }])), settings);
        expect(data.warnings).toContain(WARNINGS.duplicates);
        expect(data.periods).toHaveLength(5);
    });

    it("warns about several current periods and uses the most recent", () => {
        const data = convert(dataView(rows((r, i) => { r.isCurrentPeriod = i >= 2 ? 1 : 0; })), settings);
        expect(data.warnings).toContain(WARNINGS.multipleCurrent);
        expect(data.reference?.labels.full).toBe("Q3 '26");
    });

    it("warns about daily data", () => {
        const days = Array.from({ length: 5 }, (_, i) => ({ period: new Date(2026, 0, i + 1), primaryValue: i }));
        expect(convert(dataView(days), settings).warnings).toContain(WARNINGS.daily);
    });
});

describe("convert - highlights and metadata", () => {
    it("uses highlighted values and keeps the full value as a ghost", () => {
        const data = convert(dataView(QUARTERS, { highlights: { actualValue: [600, null, 900, 400], primaryValue: [600, null, 900, 400] } }), settings);
        expect(data.hasHighlights).toBe(true);
        expect(data.periods.map(p => p.chartActual)).toEqual([600, null, 900, 400]);
        expect(data.periods.map(p => p.chartGhost)).toEqual([1180, 1275, 1507, 975]);
        expect(data.reference?.primary).toBe(400);
    });

    it("keeps formats, names and tooltip fields", () => {
        const data = convert(dataView(QUARTERS, { formats: { primaryValue: "#,0" }, names: { primaryValue: "MAU" }, tooltips: [{ name: "Last refresh", values: ["a", "b", "c", "d"] }] }), settings);
        expect(data.formats.primaryValue).toBe("#,0");
        expect(data.names.primaryValue).toBe("MAU");
        expect(data.reference?.tooltipFields).toEqual([{ displayName: "Last refresh", value: "d", format: undefined }]);
    });

    it("works without a Period field (no history)", () => {
        const data = convert(dataView([{ primaryValue: 975, targetValue: 1000 }], { noPeriod: true }), settings);
        expect(data.hasData).toBe(true);
        expect(data.periods).toEqual([]);
        expect(data.reference?.primary).toBe(975);
    });

    it("reads text measures and boolean flags", () => {
        const data = convert(dataView(rows(r => { r.kpiTitle = " MAU "; r.statusCode = "ON_TARGET"; r.comparison1Value = "+12 (+3.4%)"; r.isCurrentPeriod = r.period === "Q3 2026"; })), settings);
        expect(data.reference?.title).toBe("MAU");
        expect(data.reference?.statusCode).toBe("ON_TARGET");
        expect(data.reference?.comparison1).toBeNull();
        expect(data.reference?.comparison1Text).toBe("+12 (+3.4%)");
        expect(data.reference?.isCurrent).toBe(true);
    });
});
