import { describe, expect, it } from "vitest";

import { convert } from "../src/dataConverter";
import { RenderContext } from "../src/renderContext";
import { createTheme } from "../src/accessibilityManager";
import { computeLayout } from "../src/layoutEngine";
import { resolveSettings } from "../src/settingsResolver";
import { computeStatus } from "../src/status";
import { buildHeaderTooltip, buildPeriodTooltip } from "../src/tooltipManager";
import { buildView, createFormatters } from "../src/viewModel";
import { QUARTER_FORMATS, TestRow, dataView, rows } from "./helpers";

type Objects = Record<string, Record<string, unknown>>;

function context(patch: (row: TestRow, index: number) => TestRow | void = () => undefined, objects: Objects = {}, options: Parameters<typeof dataView>[1] = {}): RenderContext {
    const settings = resolveSettings(objects);
    const data = convert(dataView(rows(patch), { formats: QUARTER_FORMATS, names: { primaryValue: "Premium calculations" }, ...options }), settings);
    const view = buildView(data, settings, computeStatus(data, settings), "en-US");
    return {
        settings, data, view, locale: "en-US",
        plan: computeLayout({ width: 400, height: 400 }, settings),
        theme: createTheme(undefined, settings),
        formatters: createFormatters(data, settings, "en-US")
    };
}
const view = (...args: Parameters<typeof context>) => context(...args).view;

describe("buildView - reference tile", () => {
    const v = view(r => { r.kpiTechnicalName = "ACQ-003"; r.kpiTitle = "Unique premium calculations for VMOB"; r.kpiCategory = "Business case"; r.comparison1Label = "vs previous qtr."; r.comparison2Label = "Vs same quarter last year:"; });

    it("identifies the KPI", () => {
        expect([v.technicalName, v.category, v.title, v.subtitle]).toEqual(["ACQ-003", "Business case", "Unique premium calculations for VMOB", null]);
    });
    it("formats value and target", () => {
        expect([v.primaryState, v.primaryText, v.targetText, v.varianceText]).toEqual(["value", "975", "Target 1,000", null]);
    });
    it("formats the comparisons", () => {
        expect(v.comparison1).toMatchObject({ visible: true, valueText: "-35.3%", label: "vs previous qtr.", tone: "negative" });
        expect(v.comparison2).toMatchObject({ visible: true, valueText: "-21.1%", label: "Vs same quarter last year:", tone: "neutral" });
    });
    it("builds caption and accessible description", () => {
        expect(v.caption).toBe("4 quarter pairs");
        expect(v.ariaLabel).toBe("ACQ-003 - Unique premium calculations for VMOB");
        expect(v.ariaDescription).toBe("Premium calculations: 975. Period: Q3 '26 (in progress). Target 1,000. Status: Near target. -35.3% vs previous qtr.. Vs same quarter last year: -21.1%");
    });
});

describe("buildView - texts", () => {
    it("falls back to static texts, then to the measure name for the title", () => {
        expect(view().title).toBe("Premium calculations");
        const v = view(() => undefined, { header: { titleText: "My KPI", technicalNameText: "RET-001", categoryText: "Retention", subtitleText: "Sub" } });
        expect([v.technicalName, v.category, v.title, v.subtitle]).toEqual(["RET-001", "Retention", "My KPI", "Sub"]);
    });
    it("hides header parts on demand", () => {
        const v = view(r => { r.kpiTechnicalName = "X"; }, { header: { technicalNameShow: false, titleShow: false } });
        expect([v.technicalName, v.title]).toEqual([null, null]);
    });
    it("shows the secondary value with its label", () => {
        expect(view(r => { r.secondaryValue = 9875; }).secondaryText).toBe("Actual: 9,875");
        expect(view(r => { r.secondaryValue = 9875; r.secondaryLabel = "Month to date"; }).secondaryText).toBe("Month to date: 9,875");
        expect(view(r => { r.secondaryValue = 9875; }, { mainValue: { secondaryShow: false } }).secondaryText).toBeNull();
    });
    it("handles missing values (spec 7.3)", () => {
        expect(view(r => { r.primaryValue = null; })).toMatchObject({ primaryState: "noData", primaryText: "No data" });
        expect(view(r => { r.primaryValue = null; }, { mainValue: { noDataText: "n/a" } }).primaryText).toBe("n/a");
        expect(view(r => { r.primaryValue = null; r.secondaryValue = 842; })).toMatchObject({ primaryState: "value", primaryText: "842", secondaryText: null });
        expect(view(r => { r.primaryValue = 0; })).toMatchObject({ primaryState: "value", primaryText: "0" });
        expect(view(r => { r.primaryValue = "abc"; })).toMatchObject({ primaryState: "error", primaryText: "Invalid value" });
    });
});

describe("buildView - target (spec 8)", () => {
    it("removes the line without target", () => {
        expect(view(r => { delete r.targetValue; }).targetText).toBeNull();
        expect(view(() => undefined, { target: { targetShow: false } }).targetText).toBeNull();
    });
    it("uses a configurable label", () => {
        expect(view(() => undefined, { target: { targetLabel: "Objective" } }).targetText).toBe("Objective 1,000");
    });
    it("shows the variance on demand", () => {
        const on = { target: { targetVarianceShow: true } };
        expect(view(() => undefined, on).varianceText).toBe("2.5% below target");
        expect(view(r => { r.primaryValue = 1050; }, on).varianceText).toBe("5.0% above target");
        expect(view(() => undefined, { target: { targetVarianceShow: true, targetVarianceFormat: "absolute" } }).varianceText).toBe("25 below target");
        expect(view(r => { r.targetVariance = 50; }, on).varianceText).toBe("50 above target");
        expect(view(r => { r.primaryValue = 1000; }, on).varianceText).toBe("On target");
    });
});

describe("buildView - comparisons (spec 10)", () => {
    it("can be hidden independently", () => {
        const v = view(() => undefined, { comparison1: { show: false } });
        expect([v.comparison1.visible, v.comparison2.visible]).toEqual([false, true]);
        expect(view(r => { delete r.comparison2Value; }).comparison2.visible).toBe(false);
    });
    it("supports percentage, absolute and prepared text formats", () => {
        expect(view(r => { r.comparison1Value = 0.1234; }, { comparison1: { format: "percent", decimals: 2 } }).comparison1.valueText).toBe("12.34%");
        expect(view(r => { r.comparison1Value = -532.4; }, { comparison1: { format: "number", decimals: 0 } }).comparison1.valueText).toBe("-532");
        expect(view(r => { r.comparison1Value = "+12 (+3.4%)"; }).comparison1).toMatchObject({ valueText: "+12 (+3.4%)", tone: "positive" });
    });
    it("shows sign and arrow on demand", () => {
        const c = view(r => { r.comparison1Value = 0.124; }, { comparison1: { showSign: true, showArrow: true } }).comparison1;
        expect([c.valueText, c.arrow, c.tone]).toEqual(["+12.4%", "up", "positive"]);
    });
    it("follows the performance direction and the reverse logic", () => {
        const up = (r: TestRow) => { r.comparison1Value = 0.1; };
        expect(view(up, { statusBadge: { direction: "lower" } }).comparison1.tone).toBe("negative");
        expect(view(up, { statusBadge: { direction: "neutral" } }).comparison1.tone).toBe("neutral");
        expect(view(up, { comparison1: { reverseLogic: true } }).comparison1.tone).toBe("negative");
        expect(view(up, { comparison1: { colorBySign: false } }).comparison1.tone).toBe("neutral");
        expect(view(r => { r.comparison1Value = 0; }).comparison1.tone).toBe("neutral");
    });
});

describe("buildView - chart area", () => {
    it("adapts the caption", () => {
        expect(view(r => { delete r.previousYearValue; }).caption).toBe("4 quarters");
        expect(view(() => undefined, { chart: { captionText: "Last {count} quarters" } }).caption).toBe("Last 4 quarters");
        expect(view(() => undefined, { chart: { captionShow: false } }).caption).toBeNull();
    });
    it("explains an empty chart", () => {
        expect(context(() => undefined, {}, { noPeriod: true }).view.chartMessage).toBe("Add a Period field to display the history");
        expect(view(r => { r.actualValue = null; r.primaryValue = null; r.previousYearValue = null; r.projectedValue = null; r.projectionRemaining = null; r.secondaryValue = 1; }).chartMessage).toBe("No history available");
        expect(view().chartMessage).toBeNull();
    });
    it("resolves the action URL", () => {
        expect(view(r => { r.actionUrl = "https://a.example"; }).actionUrl).toBe("https://a.example");
        expect(view(() => undefined, { interaction: { staticUrl: "https://b.example" } }).actionUrl).toBe("https://b.example");
        expect(view().actionUrl).toBeNull();
    });
});

describe("tooltips (spec 15)", () => {
    const pairs = (items: Array<{ displayName: string; value: string }>) => items.map(i => `${i.displayName}=${i.value}`);

    it("lists only the available fields for a period", () => {
        const ctx = context();
        const open = pairs(buildPeriodTooltip(ctx.data.periods[3], ctx));
        expect(open).toEqual(["Actual=975", "Projected=1,420", "Projection remaining=445", "Previous year=1,236", "Target=1,000", "vs previous period=-35.3%", "Vs previous year=-21.1%"]);
        expect(buildPeriodTooltip(ctx.data.periods[3], ctx)[0].header).toBe("Q3 '26 (in progress)");
        const closed = pairs(buildPeriodTooltip(ctx.data.periods[0], ctx));
        expect(closed).toEqual(["Actual=1,180", "Previous year=1,070", "Target=1,000", "vs previous period=+4.0%".replace("+", ""), "Vs previous year=10.3%"]);
    });
    it("mentions a projection below the actual and appends the Tooltip fields", () => {
        const ctx = context((r, i) => { if (i === 3) { r.projectedValue = 900; r.projectionRemaining = 0; } }, {}, { tooltips: [{ name: "Owner", values: ["a", "b", "c", "Team X"] }] });
        const items = pairs(buildPeriodTooltip(ctx.data.periods[3], ctx));
        expect(items).toContain("Note=Projection is below actual");
        expect(items[items.length - 1]).toBe("Owner=Team X");
    });
    it("summarises the header", () => {
        const ctx = context(r => { r.kpiTechnicalName = "ACQ-003"; r.secondaryValue = 800; });
        expect(pairs(buildHeaderTooltip(ctx))).toEqual(["KPI=ACQ-003", "Period=Q3 '26 (in progress)", "Premium calculations=975", "Actual=800", "Target=1,000", "Status=Near target"]);
    });
});
