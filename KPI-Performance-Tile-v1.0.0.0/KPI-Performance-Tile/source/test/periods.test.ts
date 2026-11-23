import { describe, expect, it } from "vitest";

import { detectGranularity, formatPeriodLabel, parsePeriod, periodCountCaption, resolveGranularity } from "../src/periods";

describe("parsePeriod", () => {
    it("parses the text formats of the specification (11.2)", () => {
        expect(parsePeriod("2026-01")).toMatchObject({ year: 2026, month: 1, hint: "month" });
        expect(parsePeriod("Q1 2026")).toMatchObject({ year: 2026, quarter: 1, hint: "quarter" });
        expect(parsePeriod("2026")).toMatchObject({ year: 2026, hint: "year" });
    });

    it("parses numeric keys", () => {
        expect(parsePeriod(202603)).toMatchObject({ year: 2026, month: 3, hint: "month" });
        expect(parsePeriod(2026)).toMatchObject({ year: 2026, hint: "year" });
        expect(parsePeriod(20264)).toMatchObject({ year: 2026, quarter: 4, hint: "quarter" });
    });

    it("parses month names in English, French and Dutch", () => {
        expect(parsePeriod("Mar 2026")).toMatchObject({ month: 3, year: 2026 });
        expect(parsePeriod("févr. 2026")).toMatchObject({ month: 2, year: 2026 });
        expect(parsePeriod("mrt 2026")).toMatchObject({ month: 3, year: 2026 });
        expect(parsePeriod("2026 Q3")).toMatchObject({ quarter: 3, year: 2026 });
        expect(parsePeriod("T2 2026")).toMatchObject({ quarter: 2, year: 2026 });
    });

    it("parses dates", () => {
        expect(parsePeriod(new Date(2026, 6, 1))).toMatchObject({ year: 2026, month: 7, quarter: 3, hint: "day" });
        expect(parsePeriod("2026-07-01")).toMatchObject({ year: 2026, month: 7 });
    });

    it("returns null for what is not a period", () => {
        expect(parsePeriod("Retention")).toBeNull();
        expect(parsePeriod(null)).toBeNull();
        expect(parsePeriod(12)).toBeNull();
    });

    it("orders periods chronologically", () => {
        const times = ["Q4 2025", "Q1 2026", "Q2 2026"].map(p => parsePeriod(p)!.time);
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });
});

describe("granularity", () => {
    const dates = (months: number[]) => months.map(m => parsePeriod(new Date(2026, m, 1)));

    it("is detected from text periods", () => {
        expect(detectGranularity(["2026-01", "2026-02"].map(parsePeriod))).toBe("month");
        expect(detectGranularity(["Q1 2026", "Q2 2026"].map(parsePeriod))).toBe("quarter");
        expect(detectGranularity([2025, 2026].map(parsePeriod))).toBe("year");
    });

    it("is detected from the gap between dates", () => {
        expect(detectGranularity(dates([0, 1, 2]))).toBe("month");
        expect(detectGranularity(dates([0, 3, 6]))).toBe("quarter");
        expect(detectGranularity([parsePeriod(new Date(2025, 0, 1)), parsePeriod(new Date(2026, 0, 1))])).toBe("year");
        expect(detectGranularity([parsePeriod(new Date(2026, 0, 1)), parsePeriod(new Date(2026, 0, 2))])).toBe("day");
    });

    it("can be forced manually", () => {
        expect(resolveGranularity("quarter", dates([0, 1, 2]))).toBe("quarter");
        expect(resolveGranularity("auto", [null])).toBe("unknown");
    });
});

describe("labels", () => {
    it("builds compact labels", () => {
        expect(formatPeriodLabel(parsePeriod("Q3 2026"), "quarter", "full")).toBe("Q3 '26");
        expect(formatPeriodLabel(parsePeriod("Q3 2026"), "quarter", "short")).toBe("Q3");
        expect(formatPeriodLabel(parsePeriod("2026-11"), "month", "full")).toBe("Nov '26");
        expect(formatPeriodLabel(parsePeriod("2026-11"), "month", "short")).toBe("Nov");
        expect(formatPeriodLabel(parsePeriod(2026), "year", "full")).toBe("2026");
        expect(formatPeriodLabel(null, "month", "full")).toBeNull();
    });

    it("counts periods", () => {
        expect(periodCountCaption(12, "month")).toBe("12 months");
        expect(periodCountCaption(1, "year")).toBe("1 year");
        expect(periodCountCaption(5, "unknown")).toBe("5 periods");
    });
});
