import { describe, expect, it } from "vitest";

import { autoDisplayUnit, formatNumber, isPercentFormat, normaliseFormat, withDecimals, withoutGrouping } from "../src/numberFormat";

const base = { mode: "inherit" as const, displayUnits: "auto" as const, decimals: null, thousandsSeparator: true, locale: "en-US" };

describe("formatNumber - examples of the specification (7.4)", () => {
    it("975", () => expect(formatNumber(975, { ...base, format: "#,0" })).toBe("975"));
    it("12.4K", () => expect(formatNumber(12400, { ...base, format: "#,0" })).toBe("12.4K"));
    it("1.7M", () => expect(formatNumber(1700000, { ...base, format: "#,0" })).toBe("1.7M"));
    it("8.3%", () => expect(formatNumber(0.083, { ...base, format: "0.0%" })).toBe("8.3%"));
    it("€1.2M", () => expect(formatNumber(1200000, { ...base, format: "#,0", prefix: "€" })).toBe("€1.2M"));
});

describe("formatNumber - options", () => {
    it("keeps full numbers without display unit", () => {
        expect(formatNumber(12450, { ...base, format: "#,0", displayUnits: "none" })).toBe("12,450");
        expect(formatNumber(1000, { ...base, format: "#,0" })).toBe("1,000");
    });
    it("forces display units", () => {
        expect(formatNumber(12450, { ...base, format: "#,0", displayUnits: "thousands", decimals: 2 })).toBe("12.45K");
        expect(formatNumber(2500000000, { ...base, format: "#,0", displayUnits: "billions" })).toBe("2.5bn");
    });
    it("sets decimals", () => {
        expect(formatNumber(975, { ...base, format: "#,0", decimals: 2 })).toBe("975.00");
        expect(formatNumber(0.0834, { ...base, format: "0.0%", decimals: 2 })).toBe("8.34%");
    });
    it("removes the thousands separator", () => {
        expect(formatNumber(12450, { ...base, format: "#,0", displayUnits: "none", thousandsSeparator: false })).toBe("12450");
    });
    it("supports percentage and number modes whatever the measure format", () => {
        expect(formatNumber(0.353, { ...base, mode: "percent", displayUnits: "none", decimals: 1 })).toBe("35.3%");
        expect(formatNumber(-0.353, { ...base, mode: "percent", displayUnits: "none", decimals: 1 })).toBe("-35.3%");
        expect(formatNumber(1234.5, { ...base, mode: "number", displayUnits: "none", decimals: 1 })).toBe("1,234.5");
    });
    it("adds prefix and suffix", () => {
        expect(formatNumber(42, { ...base, format: "#,0", prefix: "~", suffix: " users" })).toBe("~42 users");
    });
    it("displays zero as a value and nothing for empty", () => {
        expect(formatNumber(0, { ...base, format: "#,0" })).toBe("0");
        expect(formatNumber(null, base)).toBe("");
        expect(formatNumber(NaN, base)).toBe("");
    });
    it("handles negative values with units", () => {
        expect(formatNumber(-12400, { ...base, format: "#,0" })).toBe("-12.4K");
    });
});

describe("format helpers", () => {
    it("detects percentage formats", () => {
        expect(isPercentFormat("0.0%")).toBe(true);
        expect(isPercentFormat("0.0 %;-0.0 %")).toBe(true);
        expect(isPercentFormat("P1")).toBe(true);
        expect(isPercentFormat("#,0")).toBe(false);
        expect(isPercentFormat("#,0 \"%\"")).toBe(false);
        expect(isPercentFormat(undefined)).toBe(false);
    });
    it("edits decimals and grouping", () => {
        expect(withDecimals("#,0", 1)).toBe("#,0.0");
        expect(withDecimals("#,0.00", 0)).toBe("#,0");
        expect(withDecimals("0.0%", 2)).toBe("0.00%");
        expect(withoutGrouping("#,0.0")).toBe("0.0");
    });
    it("translates standard .NET formats", () => {
        expect(normaliseFormat("N2", 1)).toBe("#,0.00");
        expect(normaliseFormat("P1", 0.1)).toBe("#,0.0%");
        expect(normaliseFormat(undefined, 12)).toBe("#,0");
        expect(normaliseFormat(undefined, 12.5)).toBe("#,0.##");
    });
    it("chooses automatic display units", () => {
        expect(autoDisplayUnit(975)).toBe("none");
        expect(autoDisplayUnit(9999)).toBe("none");
        expect(autoDisplayUnit(12450)).toBe("thousands");
        expect(autoDisplayUnit(-3200000)).toBe("millions");
        expect(autoDisplayUnit(4e9)).toBe("billions");
    });
});
