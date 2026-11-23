import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { convert } from "../src/dataConverter";
import { computeChartGeometry, computeLayout, isLabelled, planPeriodLabels, resolveMode } from "../src/layoutEngine";
import { ROLES } from "../src/roles";
import { defaultSettings, resolveSettings } from "../src/settingsResolver";
import { PropDef, SCHEMA, fontPropertyNames } from "../src/settingsSchema";
import { contrastRatio, ensureContrast, isSafeUrl, withTransparency } from "../src/utils";
import { QUARTERS, dataView, rows } from "./helpers";

describe("responsive modes (spec 20)", () => {
    it("follows the breakpoints", () => {
        expect([259, 260, 399, 400, 599, 600].map(w => resolveMode(w, "auto"))).toEqual(["minimal", "compact", "compact", "standard", "standard", "large"]);
        expect(resolveMode(1000, "compact")).toBe("compact");
    });
    it("minimal mode hides the secondary elements and keeps the essentials", () => {
        const settings = resolveSettings({ chart: { legendShow: true, dataLabelsShow: true } });
        const plan = computeLayout({ width: 240, height: 300 }, settings);
        expect(plan.mode).toBe("minimal");
        expect([plan.show.subtitle, plan.show.comparison2, plan.show.category, plan.show.legend, plan.show.dataLabels]).toEqual([false, false, false, false, false]);
        expect([plan.show.chart, plan.show.details, plan.show.comparison1]).toEqual([true, true, true]);
    });
    it("standard mode shows everything that is enabled", () => {
        const plan = computeLayout({ width: 450, height: 400 }, resolveSettings({ chart: { legendShow: true } }));
        expect([plan.show.subtitle, plan.show.comparison2, plan.show.category, plan.show.legend]).toEqual([true, true, true, true]);
    });
    it("large mode adds spacing", () => {
        const settings = defaultSettings();
        expect(computeLayout({ width: 700, height: 500 }, settings).padding).toBeGreaterThan(computeLayout({ width: 450, height: 400 }, settings).padding);
    });
    it("hides secondary elements first when height is missing, the chart last", () => {
        const plan = computeLayout({ width: 450, height: 150 }, defaultSettings());
        expect(plan.sacrifices[0]).toBe("subtitle");
        expect(plan.sacrifices[plan.sacrifices.length - 1]).toBe("chart");
        expect(plan.sacrifices.indexOf("comparison2")).toBeLessThan(plan.sacrifices.indexOf("target"));
    });
    it("scales the main value with the width only when auto-size is on", () => {
        expect(computeLayout({ width: 200, height: 300 }, defaultSettings()).valueScale).toBeLessThan(1);
        expect(computeLayout({ width: 200, height: 300 }, resolveSettings({ mainValue: { valueAutoSize: false } })).valueScale).toBe(1);
    });
});

describe("period labels", () => {
    const quarters = [{ full: "Q4 '25", short: "Q4" }, { full: "Q1 '26", short: "Q1" }, { full: "Q2 '26", short: "Q2" }, { full: "Q3 '26", short: "Q3" }];
    it("uses full labels when they fit", () => expect(planPeriodLabels(quarters, 85, 10.7)).toEqual({ style: "full", step: 1 }));
    it("shortens them when space is missing", () => expect(planPeriodLabels(quarters, 30, 10.7)).toEqual({ style: "short", step: 1 }));
    it("thins them out for many periods, keeping the most recent", () => {
        const plan = planPeriodLabels(Array.from({ length: 36 }, () => ({ full: "Nov '26", short: "Nov" })), 9.5, 10.7);
        expect(plan.step).toBeGreaterThan(1);
        expect(isLabelled(35, 36, plan.step)).toBe(true);
    });
});

describe("chart geometry (spec 12 and 13)", () => {
    const settings = defaultSettings();
    const points = convert(dataView(QUARTERS), settings).periods;
    const options = { width: 340, top: 4, height: 100, layout: "grouped" as const, spacing: 35, barMaxWidth: 28, showPreviousYear: true };

    it("draws previous year and actual side by side (grouped)", () => {
        const g = computeChartGeometry(points, options);
        expect(g.periods).toHaveLength(4);
        const first = g.periods[0];
        expect(first.previousYear!.x + first.previousYear!.width).toBeLessThanOrEqual(first.actual!.x);
        expect(g.baselineY).toBe(104);
    });
    it("stacks the remaining projection exactly on top of the actual bar", () => {
        const open = computeChartGeometry(points, options).periods[3];
        expect(open.remaining!.y + open.remaining!.height).toBeCloseTo(open.actual!.y, 5);
        expect(open.projected!.height).toBeCloseTo(open.actual!.height + open.remaining!.height, 5);
        expect(computeChartGeometry(points, options).periods[0].remaining).toBeNull();
    });
    it("overlay: actual bar is narrower, in front of previous year", () => {
        const p = computeChartGeometry(points, { ...options, layout: "overlay" }).periods[1];
        expect(p.actual!.width).toBeLessThan(p.previousYear!.width);
        expect(p.actual!.x).toBeGreaterThan(p.previousYear!.x);
    });
    it("never overflows horizontally, even with 36 periods", () => {
        const many = convert(dataView(Array.from({ length: 36 }, (_, i) => ({ period: new Date(2024, i, 1), primaryValue: 100 + i, previousYearValue: 90 + i }))), resolveSettings({ chart: { periods: 36 } })).periods;
        const g = computeChartGeometry(many, { ...options, width: 200 });
        for (const p of g.periods) {
            for (const r of [p.actual, p.previousYear]) {
                expect(r!.x).toBeGreaterThanOrEqual(0);
                expect(r!.x + r!.width).toBeLessThanOrEqual(200.001);
                expect(r!.height).toBeGreaterThanOrEqual(0);
            }
        }
    });
    it("supports negative values around a zero baseline", () => {
        const mixed = convert(dataView(rows((r, i) => { r.actualValue = i % 2 ? -50 : 100; r.previousYearValue = 20; r.projectionRemaining = 0; r.projectedValue = null; })), settings).periods;
        const g = computeChartGeometry(mixed, options);
        expect(g.baselineY).toBeGreaterThan(4);
        expect(g.baselineY).toBeLessThan(104);
        expect(g.periods[1].actual!.y).toBeCloseTo(g.baselineY, 5);
    });
    it("handles a series of zeros", () => {
        const zeros = convert(dataView(rows(r => { r.actualValue = 0; r.previousYearValue = 0; r.projectionRemaining = 0; })), settings).periods;
        const g = computeChartGeometry(zeros, options);
        expect(Number.isFinite(g.baselineY)).toBe(true);
    });
});

describe("settings", () => {
    it("has documented defaults", () => {
        const s = defaultSettings();
        expect(s.chart.periods).toBe(12);
        expect(s.chart.layout).toBe("grouped");
        expect(s.target.targetShow).toBe(true);
        expect(s.target.targetVarianceShow).toBe(false);
        expect(s.details.detailsText).toBe("Details →");
        expect(s.mainValue.noDataText).toBe("No data");
    });
    it("reads persisted values and rejects invalid ones", () => {
        const s = resolveSettings({
            chart: { periods: 500, layout: "overlay", actualColor: { solid: { color: "#112233" } }, sort: "nonsense" },
            header: { titleFontSize: 18, titleFontBold: false, titleAlign: "center" },
            details: { detailsShow: false }
        });
        expect(s.chart.periods).toBe(36);
        expect(s.chart.layout).toBe("overlay");
        expect(s.chart.actualColor).toBe("#112233");
        expect(s.chart.sort).toBe("asc");
        expect(s.header.titleFont).toMatchObject({ size: 18, bold: false });
        expect(s.header.titleAlign).toBe("center");
        expect(s.details.detailsShow).toBe(false);
    });
});

describe("capabilities.json is in sync with the code", () => {
    const capabilities = JSON.parse(readFileSync(resolve(process.cwd(), "capabilities.json"), "utf8"));

    it("declares every data role", () => {
        expect(capabilities.dataRoles.map((r: { name: string }) => r.name)).toEqual(ROLES.map(r => r.name));
        expect(ROLES.map(r => r.displayName)).toEqual(expect.arrayContaining(["Period", "Primary Value", "Secondary Value", "Actual Value", "Projected Value", "Projection Remaining", "Previous Year Value", "Target Value", "Comparison 1 Value", "Comparison 2 Value", "Status Value", "Status Code", "Status Label", "Is Current Period", "KPI Technical Name", "KPI Title", "KPI Subtitle", "KPI Category", "Action URL", "Tooltip Fields", "Period Sort Key"]));
    });
    it("declares every formatting property", () => {
        for (const [cardName, card] of Object.entries(SCHEMA)) {
            const declared = Object.keys(capabilities.objects[cardName].properties);
            const expected: string[] = [];
            for (const [key, def] of Object.entries(card.props as Record<string, PropDef>)) {
                if (def.kind === "font") {
                    expected.push(...Object.values(fontPropertyNames(key)));
                } else {
                    expected.push(key);
                }
            }
            expect(declared).toEqual(expected);
        }
    });
    it("requests no privilege and supports the expected host features", () => {
        expect(capabilities.privileges).toEqual([]);
        expect(capabilities).toMatchObject({ supportsHighlight: true, supportsKeyboardFocus: true, supportsLandingPage: true, supportsEmptyDataView: true, supportsMultiVisualSelection: true });
        expect(capabilities.tooltips.supportedTypes).toEqual({ default: true, canvas: true });
    });
});

describe("utils", () => {
    it("only accepts http(s) URLs", () => {
        expect(isSafeUrl("https://app.powerbi.com/groups/me")).toBe(true);
        expect(isSafeUrl("http" + "://intranet/report")).toBe(true);
        expect(isSafeUrl("javascript:alert(1)")).toBe(false);
        expect(isSafeUrl("data:text/html,x")).toBe(false);
        expect(isSafeUrl("")).toBe(false);
        expect(isSafeUrl(null)).toBe(false);
    });
    it("computes and enforces contrast", () => {
        expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
        const fixed = ensureContrast("#BBBBBB", "#FFFFFF");
        expect(contrastRatio(fixed, "#FFFFFF")!).toBeGreaterThanOrEqual(4.5);
        expect(ensureContrast("#1F2523", "#FFFFFF")).toBe("#1F2523");
    });
    it("default text colors reach WCAG AA on the default background", () => {
        const s = defaultSettings();
        const colors = [s.header.technicalNameColor, s.header.categoryColor, s.header.titleColor, s.header.subtitleColor, s.mainValue.valueColor, s.mainValue.secondaryColor, s.target.targetColor, s.comparison1.labelColor, s.comparison1.positiveColor, s.comparison1.negativeColor, s.comparison1.neutralColor, s.chart.labelColor, s.details.detailsColor];
        for (const color of colors) {
            expect(contrastRatio(color, s.tile.backgroundColor)!).toBeGreaterThanOrEqual(4.5);
        }
        for (const state of ["onTarget", "nearTarget", "belowTarget", "aboveTarget", "noTarget", "noData", "custom"]) {
            const badge = s.statusBadge as unknown as Record<string, string>;
            expect(contrastRatio(badge[`${state}TextColor`], badge[`${state}BackgroundColor`])!).toBeGreaterThanOrEqual(4.5);
        }
    });
    it("applies transparency", () => {
        expect(withTransparency("#FFFFFF", 0)).toBe("#FFFFFF");
        expect(withTransparency("#000000", 50)).toBe("rgba(0, 0, 0, 0.5)");
    });
});
