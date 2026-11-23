/* Scenarios covering the functional states of the specification (sections 23, 25 and 29). */
(function () {
    "use strict";

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    /** Monthly series ending in November 2026 (open month). */
    function monthly(count, options) {
        const o = Object.assign({ base: 9000, step: 260, noise: 420, py: 0.9, open: true, target: 12000 }, options);
        const rows = [];
        for (let i = 0; i < count; i++) {
            const back = count - 1 - i;
            const date = new Date(2026, 10 - back, 1);
            const wave = Math.sin(i * 1.7) * o.noise;
            const actual = Math.round(o.base + i * o.step + wave);
            const row = {
                period: o.asDate ? date : (o.asKey ? date.getFullYear() * 100 + date.getMonth() + 1 : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`),
                actual,
                primary: actual,
                isCurrent: 0
            };
            if (o.py) {
                row.py = Math.round(actual * (o.py + Math.cos(i) * 0.05));
            }
            if (o.target) {
                row.target = o.target;
            }
            rows.push(row);
        }
        if (o.open && rows.length) {
            const last = rows[rows.length - 1];
            last.isCurrent = 1;
            last.projected = 12450;
            last.actual = 9875;
            last.remaining = last.projected - last.actual;
            last.primary = last.projected;
            last.secondary = last.actual;
        }
        return rows;
    }

    const reference = {
        title: "Reference (ACQ-003, quarterly)",
        note: "Reproduces the capture of the specification.",
        size: { width: 370, height: 375 },
        names: { primary: "Unique premium calculations", py: "Previous Year", actual: "Actual" },
        formats: { primary: "#,0", target: "#,0", cmp1: "0.0%;-0.0%;0.0%", cmp2: "0.0%;-0.0%;0.0%", actual: "#,0", projected: "#,0", remaining: "#,0", py: "#,0" },
        rows: [
            { period: "Q4 2025", actual: 1180, py: 1070, primary: 1180, target: 1000, cmp1: 0.04, cmp2: 0.103, isCurrent: 0 },
            { period: "Q1 2026", actual: 1275, py: 1065, primary: 1275, target: 1000, cmp1: 0.081, cmp2: 0.197, isCurrent: 0 },
            { period: "Q2 2026", actual: 1507, py: 1240, primary: 1507, target: 1000, cmp1: 0.182, cmp2: 0.215, isCurrent: 0 },
            { period: "Q3 2026", actual: 975, projected: 1420, remaining: 445, py: 1236, primary: 975, target: 1000, cmp1: -0.353, cmp2: -0.211, isCurrent: 1 }
        ].map(r => Object.assign({ tech: "ACQ-003", title: "Unique premium calculations for VMOB", category: "Business case", cmp1Label: "vs previous qtr.", cmp2Label: "Vs same quarter last year:" }, r)),
        objects: {}
    };

    const mau = {
        title: "RET-001 MAU (monthly, 12 periods)",
        note: "Primary = Projected, Secondary = Actual, status from thresholds.",
        size: { width: 370, height: 375 },
        names: { primary: "MAU Projected", secondary: "MAU Actual", actual: "MAU Actual" },
        formats: { primary: "#,0", secondary: "#,0", target: "#,0", cmp1: "0.0%", cmp2: "0.0%" },
        rows: monthly(12).map(r => Object.assign({ tech: "RET-001", title: "Monthly Active Users", subtitle: "Users active at least once during the month", category: "Retention", cmp1: 0.062, cmp2: 0.118 }, r)),
        tooltipFields: [{ name: "Last refresh", values: "2026-11-20 06:00" }],
        objects: { comparison1: { label: "vs previous month" }, comparison2: { label: "Vs same month last year:" } }
    };

    const yau = {
        title: "RET-002 YAU (yearly)",
        note: "Granularity = Year, one comparison only.",
        size: { width: 370, height: 375 },
        names: { primary: "YAU Projected", secondary: "YAU Actual" },
        formats: { primary: "#,0", secondary: "#,0", target: "#,0", cmp1: "0.0%" },
        rows: [2022, 2023, 2024, 2025, 2026].map((year, i) => ({
            period: year, actual: [31200, 35800, 41000, 46900, 39400][i], py: [28000, 31200, 35800, 41000, 46900][i],
            primary: i === 4 ? 52300 : [31200, 35800, 41000, 46900][i], secondary: i === 4 ? 39400 : undefined,
            projected: i === 4 ? 52300 : undefined, remaining: i === 4 ? 12900 : undefined, target: 50000,
            cmp1: [0.11, 0.147, 0.145, 0.144, 0.115][i], isCurrent: i === 4 ? 1 : 0,
            tech: "RET-002", title: "Yearly Active Users", category: "Retention", statusCode: i === 4 ? "ON_TARGET" : "BELOW_TARGET"
        })),
        objects: { chart: { granularity: "year" }, comparison1: { label: "vs previous year" } }
    };

    const stickiness = {
        title: "RET-003 Stickiness (no target)",
        note: "Percentage, target line hidden, 'No target' badge.",
        size: { width: 370, height: 375 },
        names: { primary: "Stickiness Projected", secondary: "Stickiness Actual" },
        formats: { primary: "0.0%", secondary: "0.0%", actual: "0.0%", py: "0.0%", projected: "0.0%", cmp1: "+0.0 pt;-0.0 pt", cmp2: "+0.0 pt;-0.0 pt" },
        rows: monthly(12, { target: 0 }).map((r, i, all) => {
            const actual = 0.19 + Math.sin(i) * 0.02 + i * 0.002;
            const last = i === all.length - 1;
            return {
                period: r.period, actual: last ? 0.171 : actual, py: actual - 0.015, projected: last ? 0.214 : undefined,
                primary: last ? 0.214 : actual, secondary: last ? 0.171 : undefined, cmp1: 0.6, cmp2: 1.9, isCurrent: last ? 1 : 0,
                tech: "RET-003", title: "Usage Frequency (Stickiness)", category: "Engagement"
            };
        }),
        objects: { comparison1: { label: "vs previous month" }, comparison2: { label: "Vs same month last year:" } }
    };

    const base = (extra) => Object.assign({}, reference, extra);
    const mapRows = (rows, fn) => rows.map((r, i) => fn(Object.assign({}, r), i));

    const scenarios = [
        reference,
        mau,
        yau,
        stickiness,
        base({
            title: "No projection (23.3)", note: "Closed periods only: no remaining segment.",
            rows: mapRows(reference.rows, r => { delete r.projected; delete r.remaining; r.isCurrent = 0; return r; })
        }),
        base({
            title: "No previous year (23.4)", note: "PY bars and comparison 2 hidden.",
            rows: mapRows(reference.rows, r => { delete r.py; delete r.cmp2; delete r.cmp2Label; return r; })
        }),
        base({
            title: "No history (23.5)", note: "Only header measures, no Period field.",
            noPeriod: true, rows: [Object.assign({}, reference.rows[3])]
        }),
        base({
            title: "Projection below actual (23.7)", note: "Remaining = 0, note in the tooltip.",
            rows: mapRows(reference.rows, (r, i) => { if (i === 3) { r.projected = 900; r.remaining = -75; } return r; })
        }),
        base({
            title: "Inconsistent data (23.8)", note: "Duplicate period + two current periods: warning icon.",
            rows: reference.rows.concat([Object.assign({}, reference.rows[2], { isCurrent: 1 })])
        }),
        base({
            title: "Lower is better + status code", note: "Positive variance shown as unfavourable; ABOVE_TARGET from DAX.",
            rows: mapRows(reference.rows, r => { r.statusCode = "ABOVE_TARGET"; r.statusLabel = "Above limit"; r.cmp1 = 0.124; return r; }),
            objects: { statusBadge: { direction: "lower", aboveTargetIcon: "arrowUp" }, comparison1: { showSign: true, showArrow: true } }
        }),
        base({
            title: "No data / empty primary (7.3)", note: "Primary and secondary empty.",
            rows: mapRows(reference.rows, r => { r.primary = null; return r; })
        }),
        base({
            title: "Secondary promoted (7.3)", note: "Primary empty, Secondary available.",
            rows: mapRows(reference.rows, r => { r.primary = null; r.secondary = 842; return r; }), names: { secondary: "Actual MTD" }
        }),
        base({
            title: "Target variance + secondary", note: "Show target variance on, units, prefix.",
            rows: mapRows(reference.rows, r => { r.primary = r.primary * 1280; r.target = 1300000; r.secondary = r.primary * 0.8; return r; }),
            formats: Object.assign({}, reference.formats, { primary: "#,0", secondary: "#,0" }),
            objects: { target: { targetVarianceShow: true, targetDisplayUnits: "auto" }, mainValue: { prefix: "€", secondaryLabel: "Month to date" } }
        }),
        Object.assign({}, mau, {
            title: "Overlay + legend + data labels (large)", note: "600 px and wider: large mode.",
            size: { width: 640, height: 400 },
            objects: { chart: { layout: "overlay", legendShow: true, dataLabelsShow: true, gridlinesShow: true }, comparison1: { label: "vs previous month" }, comparison2: { label: "Vs same month last year:" } }
        }),
        Object.assign({}, mau, {
            title: "36 periods (maximum)", note: "Labels thinned, no horizontal scroll.",
            rows: monthly(36).map(r => Object.assign({ tech: "RET-001", title: "Monthly Active Users", category: "Retention", cmp1: 0.062, cmp2: 0.118 }, r)),
            objects: { chart: { periods: 36 }, comparison1: { label: "vs previous month" }, comparison2: { label: "Vs same month last year:" } }
        }),
        Object.assign({}, mau, {
            title: "Date column + sort desc", note: "Period as dates, newest first, dotted pattern.",
            rows: monthly(8, { asDate: true }).map(r => Object.assign({ tech: "RET-001", title: "Monthly Active Users", category: "Retention", cmp1: -0.031, cmp2: 0.118 }, r)),
            periodFormat: "MMM yyyy",
            objects: { chart: { sort: "desc", projectionPattern: "dotted" }, comparison1: { label: "vs previous month" }, comparison2: { label: "Vs same month last year:" } }
        }),
        Object.assign({}, reference, { title: "Compact (300 px)", note: "260-399 px.", size: { width: 300, height: 300 } }),
        Object.assign({}, mau, { title: "Minimal (230 px)", note: "< 260 px: subtitle, category, comparison 2 hidden.", size: { width: 230, height: 250 } }),
        Object.assign({}, mau, { title: "Low height (400 x 190)", note: "Secondary elements hidden progressively.", size: { width: 400, height: 190 } }),
        Object.assign({}, reference, { title: "Very small (200 x 120)", note: "Chart dropped, key figures kept.", size: { width: 200, height: 120 } }),
        Object.assign({}, reference, { title: "High contrast", note: "Host palette in high-contrast mode.", host: { highContrast: true } }),
        Object.assign({}, reference, {
            title: "Cross-highlight", note: "Another visual highlights part of the values.",
            highlights: { actual: [600, null, 900, 400], primary: [600, null, 900, 400] }
        }),
        base({
            title: "Custom styling", note: "Badges, borders, colors, static texts.",
            rows: mapRows(reference.rows, r => { delete r.category; delete r.tech; return r; }),
            objects: {
                tile: { backgroundColor: { solid: { color: "#F6F8FB" } }, borderRadius: 16, shadow: true, borderShow: false },
                header: { technicalNameText: "OPS-042", technicalNameBackgroundShow: true, categoryText: "Operations", categoryBadge: true, categoryColor: { solid: { color: "#1D4E89" } }, categoryBadgeColor: { solid: { color: "#DDE9F7" } } },
                chart: { actualColor: { solid: { color: "#1D4E89" } }, previousYearColor: { solid: { color: "#B5C7DC" } }, barRadius: 3, captionText: "Last {count} quarters" },
                statusBadge: { badgeBorderShow: true, badgeRadius: 12 },
                details: { detailsText: "Open report →", detailsColor: { solid: { color: "#1D4E89" } } }
            }
        }),
        { title: "Landing page (24)", note: "No field assigned.", size: { width: 370, height: 375 }, empty: true }
    ];

    window.KPT_SCENARIOS = scenarios;
    window.KPT_SCENARIO_HELPERS = { monthly, reference, mau };
})();
