import { describe, expect, it } from "vitest";

import { convert } from "../src/dataConverter";
import { defaultSettings, resolveSettings } from "../src/settingsResolver";
import { computeStatus, evaluateThresholds, normaliseStatusCode } from "../src/status";
import { QUARTERS, dataView, rows } from "./helpers";

const higher = { direction: "higher" as const, onTargetThreshold: 0, nearThreshold: -0.05, aboveEnabled: false, aboveThreshold: 0.1 };
const lower = { ...higher, direction: "lower" as const };

describe("evaluateThresholds (spec 9.3)", () => {
    it("higher is better: gap >= 0 on target, -5%..0 near, below -5% below", () => {
        expect(evaluateThresholds(0, higher)).toBe("ON_TARGET");
        expect(evaluateThresholds(0.2, higher)).toBe("ON_TARGET");
        expect(evaluateThresholds(-0.025, higher)).toBe("NEAR_TARGET");
        expect(evaluateThresholds(-0.05, higher)).toBe("NEAR_TARGET");
        expect(evaluateThresholds(-0.051, higher)).toBe("BELOW_TARGET");
    });

    it("lower is better: gap <= 0 on target, 0..5% near, above 5% below performance", () => {
        expect(evaluateThresholds(0, lower)).toBe("ON_TARGET");
        expect(evaluateThresholds(-0.3, lower)).toBe("ON_TARGET");
        expect(evaluateThresholds(0.03, lower)).toBe("NEAR_TARGET");
        expect(evaluateThresholds(0.05, lower)).toBe("NEAR_TARGET");
        expect(evaluateThresholds(0.08, lower)).toBe("BELOW_TARGET");
    });

    it("supports an optional 'above target' zone", () => {
        expect(evaluateThresholds(0.15, { ...higher, aboveEnabled: true })).toBe("ABOVE_TARGET");
        expect(evaluateThresholds(0.05, { ...higher, aboveEnabled: true })).toBe("ON_TARGET");
        expect(evaluateThresholds(-0.15, { ...lower, aboveEnabled: true })).toBe("ABOVE_TARGET");
    });

    it("accepts custom thresholds", () => {
        const rules = { ...higher, onTargetThreshold: 0.9, nearThreshold: 0.8 };
        expect(evaluateThresholds(0.95, rules)).toBe("ON_TARGET");
        expect(evaluateThresholds(0.85, rules)).toBe("NEAR_TARGET");
        expect(evaluateThresholds(0.7, rules)).toBe("BELOW_TARGET");
    });
});

describe("normaliseStatusCode", () => {
    it("accepts the documented codes, case and separator insensitive", () => {
        expect(normaliseStatusCode("ON_TARGET")).toBe("ON_TARGET");
        expect(normaliseStatusCode("near target")).toBe("NEAR_TARGET");
        expect(normaliseStatusCode(" below-target ")).toBe("BELOW_TARGET");
        expect(normaliseStatusCode("whatever")).toBeNull();
        expect(normaliseStatusCode(null)).toBeNull();
    });
});

describe("computeStatus", () => {
    const status = (patch: Parameters<typeof rows>[0], objects: Record<string, Record<string, unknown>> = {}) => {
        const settings = resolveSettings(objects);
        return computeStatus(convert(dataView(rows(patch)), settings), settings);
    };

    it("derives the gap to target when no status field is bound", () => {
        expect(status(() => undefined)).toMatchObject({ code: "NEAR_TARGET", label: "Near target", visible: true }); // 975 vs 1,000 = -2.5%
        expect(status(r => { r.primaryValue = 1100; })).toMatchObject({ code: "ON_TARGET" });
        expect(status(r => { r.primaryValue = 800; })).toMatchObject({ code: "BELOW_TARGET" });
    });

    it("uses Status Value with the thresholds", () => {
        expect(status(r => { r.statusValue = -0.2; })).toMatchObject({ code: "BELOW_TARGET" });
        expect(status(r => { r.statusValue = 0.03; }, { statusBadge: { direction: "lower" } })).toMatchObject({ code: "NEAR_TARGET" });
    });

    it("uses Status Code and Status Label from the model (mode B)", () => {
        expect(status(r => { r.statusCode = "ABOVE_TARGET"; r.statusLabel = "Ahead"; })).toMatchObject({ code: "ABOVE_TARGET", state: "aboveTarget", label: "Ahead" });
        expect(status(r => { r.statusCode = "MY_STATE"; })).toMatchObject({ code: "CUSTOM", state: "custom", label: "MY_STATE" });
    });

    it("thresholds mode ignores a bound Status Code", () => {
        expect(status(r => { r.statusCode = "ON_TARGET"; }, { statusBadge: { mode: "thresholds" } })).toMatchObject({ code: "NEAR_TARGET" });
    });

    it("shows 'No target' when there is no target, unless disabled", () => {
        expect(status(r => { delete r.targetValue; })).toMatchObject({ code: "NO_TARGET", label: "No target", visible: true });
        expect(status(r => { delete r.targetValue; }, { statusBadge: { showNoTarget: false } })).toMatchObject({ code: "NO_TARGET", visible: false });
    });

    it("reports 'No data' when the header has no value", () => {
        expect(status(r => { r.primaryValue = null; })).toMatchObject({ code: "NO_DATA" });
    });

    it("neutral direction never judges the value", () => {
        expect(status(() => undefined, { statusBadge: { direction: "neutral" } }).state).toBe("custom");
    });

    it("uses the per-state texts of the format pane", () => {
        expect(status(() => undefined, { statusBadge: { nearTargetText: "Almost" } }).label).toBe("Almost");
    });

    it("can be hidden", () => {
        expect(status(() => undefined, { statusBadge: { badgeShow: false } }).visible).toBe(false);
    });

    it("default settings are the documented ones", () => {
        const s = defaultSettings().statusBadge;
        expect([s.mode, s.direction, s.onTargetThreshold, s.nearThreshold]).toEqual(["auto", "higher", 0, -0.05]);
        expect(QUARTERS).toHaveLength(4);
    });
});
