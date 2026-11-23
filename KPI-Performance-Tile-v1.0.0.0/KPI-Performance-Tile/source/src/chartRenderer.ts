/**
 * Mini history chart (spec 12 and 13): Actual vs Previous Year per period, and for the open
 * period the Actual bar with the Projection Remaining stacked on top (hatched + dashed outline,
 * so that the projection is never identified by color alone).
 */
import { autoDisplayUnit } from "./numberFormat";
import { RenderContext } from "./renderContext";
import { PeriodGeometry, Rect, computeChartGeometry, isLabelled, planPeriodLabels } from "./layoutEngine";
import { PeriodPoint } from "./types";
import { applyFont, el, estimateTextWidth, ptToPx, svgEl, uniqueId } from "./utils";

export interface ChartFlags {
    periodLabels: boolean;
    currentIndicator: boolean;
    dataLabels: boolean;
    gridlines: boolean;
}

export interface PeriodNode {
    point: PeriodPoint;
    group: SVGGElement;
}

export interface ChartHandle {
    svg: SVGSVGElement;
    nodes: PeriodNode[];
    setSelection(selected: ReadonlySet<number>): void;
}

function rect(r: Rect, className: string, radius: number): SVGRectElement {
    const node = svgEl("rect", {
        x: Math.round(r.x * 100) / 100,
        y: Math.round(r.y * 100) / 100,
        width: Math.max(0, Math.round(r.width * 100) / 100),
        height: Math.max(0, Math.round(r.height * 100) / 100)
    });
    if (radius > 0) {
        node.setAttribute("rx", String(Math.min(radius, r.width / 2, Math.max(0, r.height / 2))));
    }
    node.setAttribute("class", className);
    return node;
}

function createPattern(kind: "hatched" | "dotted", id: string, color: string): SVGPatternElement {
    if (kind === "dotted") {
        const pattern = svgEl("pattern", { id, width: 5, height: 5, patternUnits: "userSpaceOnUse" });
        pattern.appendChild(svgEl("circle", { cx: 1.5, cy: 1.5, r: 1, fill: color }));
        pattern.appendChild(svgEl("circle", { cx: 4, cy: 4, r: 1, fill: color }));
        return pattern;
    }
    const pattern = svgEl("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse" });
    pattern.appendChild(svgEl("path", {
        d: "M-1.5 1.5 1.5-1.5M0 6 6 0M4.5 7.5 7.5 4.5",
        stroke: color,
        "stroke-width": 1.3,
        "stroke-linecap": "square",
        fill: "none"
    }));
    return pattern;
}

function describe(point: PeriodPoint, ctx: RenderContext): string {
    const { data, settings, formatters } = ctx;
    const c = settings.chart;
    const parts: string[] = [];
    const actual = data.bound.actualValue
        ? formatters.detail(point.actual, "actualValue")
        : formatters.detail(point.primary, "primaryValue");
    if (actual) {
        parts.push(`${data.bound.actualValue ? c.actualLabel : (data.names.primaryValue ?? c.actualLabel)} ${actual}`);
    }
    const projected = formatters.detail(point.projected, "projectedValue");
    if (projected && point.isOpen) {
        parts.push(`${c.projectedLabel} ${projected}`);
    }
    const previous = formatters.detail(point.previousYear, "previousYearValue");
    if (previous && c.previousYearShow) {
        parts.push(`${c.previousYearLabel} ${previous}`);
    }
    const label = point.labels.full + (point.isOpen && c.currentIndicatorText ? `, ${c.currentIndicatorText}` : "");
    return parts.length > 0 ? `${label}: ${parts.join("; ")}` : label;
}

export function renderChart(
    host: HTMLElement,
    width: number,
    height: number,
    flags: ChartFlags,
    ctx: RenderContext,
    selected: ReadonlySet<number>
): ChartHandle {
    const { data, settings, plan, theme, formatters } = ctx;
    const c = settings.chart;
    const points = data.periods;
    const count = points.length;
    const labelPx = Math.max(8, Math.round(ptToPx(c.labelFont.size) * plan.textScale * 10) / 10);
    const showPreviousYear = c.previousYearShow && !!data.bound.previousYearValue;
    const bandWidth = count > 0 ? width / count : width;

    // ---- period labels: full ("Q3 '26"), short ("Q3") or one out of N when space is missing
    const labelPlan = planPeriodLabels(points.map(p => p.labels), bandWidth, labelPx, plan.mode === "minimal");
    const autoLabels = c.periodLabelFormat === "auto";
    const yearMarks = labelPlan.style === "short" && autoLabels && (data.granularity === "month" || data.granularity === "quarter");
    let lastLabelledYear: number | null = null;
    const lines: Array<{ first: string | null; second: string | null }> = points.map((p, index) => {
        if (!flags.periodLabels) {
            return { first: null, second: null };
        }
        const labelled = isLabelled(index, count, labelPlan.step);
        const first = labelled ? p.labels[labelPlan.style] : null;
        let second: string | null = null;
        if (flags.currentIndicator && p.isOpen && c.currentIndicatorText) {
            second = c.currentIndicatorText;
        } else if (labelled && yearMarks && p.parsed) {
            // The year is shown under the first label and each time it changes.
            if (lastLabelledYear !== p.parsed.year) {
                second = `'${String(p.parsed.year % 100).padStart(2, "0")}`;
            }
        }
        if (labelled && p.parsed && (second === null || second.startsWith("'"))) {
            lastLabelledYear = p.parsed.year;
        }
        return { first, second };
    });
    const hasSecondLine = lines.some(line => line.second !== null);
    const labelsHeight = flags.periodLabels ? labelPx * 1.3 + 3 + (hasSecondLine ? labelPx * 1.15 : 0) : 0;
    const topPadding = flags.dataLabels ? labelPx + 5 : 3;
    const plotHeight = Math.max(8, height - labelsHeight - topPadding - 1);

    const geometry = computeChartGeometry(points, {
        width,
        top: topPadding,
        height: plotHeight,
        layout: c.layout,
        spacing: c.barSpacing,
        barMaxWidth: c.barMaxWidth * (plan.mode === "large" ? 1.25 : 1),
        showPreviousYear
    });

    const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}` });
    svg.setAttribute("class", "kpt-chart-svg");
    svg.setAttribute("role", "listbox");
    svg.setAttribute("aria-label", `History: ${ctx.view.caption ?? `${count} periods`}`);
    svg.setAttribute("aria-multiselectable", settings.interaction.multiSelect ? "true" : "false");

    // ---- projection pattern
    const patternId = uniqueId("kpt-pattern");
    const hasPattern = c.projectionPattern !== "none" || theme.highContrast;
    if (hasPattern) {
        const defs = svgEl("defs");
        defs.appendChild(createPattern(c.projectionPattern === "dotted" ? "dotted" : "hatched", patternId, theme.mark(c.projectionPatternColor)));
        svg.appendChild(defs);
    }

    // ---- gridlines
    if (flags.gridlines) {
        const grid = svgEl("g");
        grid.setAttribute("class", "kpt-grid");
        for (let i = 1; i <= 3; i++) {
            const y = Math.round(geometry.scale(geometry.domain.max * i / 3)) + 0.5;
            grid.appendChild(svgEl("line", { x1: 0, x2: width, y1: y, y2: y, stroke: theme.line(c.axisColor), "stroke-width": 1, "stroke-dasharray": "2 3", opacity: 0.7 }));
        }
        svg.appendChild(grid);
    }

    // One display unit for all the data labels (9.0K, 9.7K, 10.2K rather than 9,000 and 10.2K).
    const labelUnit = autoDisplayUnit(points.reduce((max, p) => Math.max(max, Math.abs((p.chartActual ?? 0) + p.chartRemaining)), 0));

    const softMark = theme.softMark(c.previousYearColor);
    const actualColor = theme.mark(c.actualColor);
    const labelColor = theme.text(c.labelColor);
    const nodes: PeriodNode[] = [];

    const addText = (parent: SVGElement, text: string, center: number, baseline: number, className: string, scale = 1): void => {
        const fontPx = labelPx * scale;
        const half = estimateTextWidth(text, fontPx) / 2;
        // Keep the text inside the chart: labels of the first / last period never overflow the tile.
        const x = half * 2 >= width ? width / 2 : Math.max(half, Math.min(width - half, center));
        const node = svgEl("text", { x: Math.round(x * 10) / 10, y: Math.round(baseline * 10) / 10, "text-anchor": "middle" });
        node.setAttribute("class", className);
        applyFont(node, c.labelFont, labelColor, plan.textScale * scale, 8 * scale);
        node.textContent = text;
        parent.appendChild(node);
    };

    geometry.periods.forEach((g: PeriodGeometry, index: number) => {
        const point = points[index];
        const group = svgEl("g");
        group.setAttribute("class", "kpt-period" + (point.isOpen ? " kpt-open" : ""));
        group.setAttribute("role", "option");
        group.setAttribute("aria-label", describe(point, ctx));
        group.setAttribute("data-row", String(point.rowIndex));

        const hit = svgEl("rect", { x: g.bandX, y: 0, width: g.bandWidth, height, fill: "transparent" });
        hit.setAttribute("class", "kpt-hit");
        group.appendChild(hit);

        if (g.previousYear) {
            const previous = rect(g.previousYear, "kpt-mark kpt-bar-py", c.barRadius);
            previous.setAttribute("fill", softMark.fill);
            if (softMark.stroke) {
                previous.setAttribute("stroke", softMark.stroke);
                previous.setAttribute("stroke-width", "1");
            }
            group.appendChild(previous);
        }
        if (g.ghost) {
            const ghost = rect(g.ghost, "kpt-ghost", c.barRadius);
            ghost.setAttribute("fill", actualColor);
            ghost.setAttribute("opacity", "0.3");
            group.appendChild(ghost);
        }
        if (g.actual) {
            const actual = rect(g.actual, "kpt-mark kpt-bar-actual", c.barRadius);
            actual.setAttribute("fill", actualColor);
            group.appendChild(actual);
        }
        if (g.remaining) {
            const base = rect(g.remaining, "kpt-mark kpt-bar-remaining", 0);
            base.setAttribute("fill", theme.surface(c.projectionColor));
            group.appendChild(base);
            if (hasPattern) {
                const overlay = rect(g.remaining, "kpt-mark kpt-bar-pattern", 0);
                overlay.setAttribute("fill", `url(#${patternId})`);
                group.appendChild(overlay);
            }
        }
        if (g.projected && (c.projectionBorder || theme.highContrast || !hasPattern)) {
            const inset = 0.6;
            const outline = rect({
                x: g.projected.x + inset,
                y: g.projected.y + inset,
                width: Math.max(0, g.projected.width - inset * 2),
                height: Math.max(0, g.projected.height - inset)
            }, "kpt-mark kpt-bar-outline", c.barRadius);
            outline.setAttribute("fill", "none");
            outline.setAttribute("stroke", theme.line(c.projectionBorderColor));
            outline.setAttribute("stroke-width", "1.2");
            outline.setAttribute("stroke-dasharray", "3 2");
            group.appendChild(outline);
        }

        if (flags.dataLabels && isLabelled(index, count, labelPlan.step)) {
            const open = point.chartRemaining > 0;
            const value = open ? (point.projected ?? (point.chartActual ?? 0) + point.chartRemaining) : point.chartActual;
            const role = open ? "projectedValue" : (data.bound.actualValue ? "actualValue" : "primaryValue");
            const text = formatters.compact(value, role, labelUnit);
            if (text && estimateTextWidth(text, labelPx * 0.95) <= g.bandWidth * labelPlan.step + 2) {
                addText(group, text, g.center, Math.max(labelPx, g.top - 3), "kpt-data-label", 0.95);
            }
        }

        const line = lines[index];
        const labelBaseline = topPadding + plotHeight + 3 + labelPx;
        if (line.first) {
            addText(group, line.first, g.center, labelBaseline, "kpt-period-label");
        }
        if (line.second) {
            addText(group, line.second, g.center, labelBaseline + labelPx * 1.1, "kpt-period-sub", 0.9);
        }

        svg.appendChild(group);
        nodes.push({ point, group });
    });

    if (c.axisShow) {
        const y = Math.round(geometry.baselineY) + 0.5;
        const axis = svgEl("line", { x1: 0, x2: width, y1: y, y2: y, stroke: theme.line(c.axisColor), "stroke-width": 1 });
        axis.setAttribute("class", "kpt-axis");
        svg.appendChild(axis);
    }

    const setSelection = (rows: ReadonlySet<number>): void => {
        for (const node of nodes) {
            const isSelected = rows.has(node.point.rowIndex);
            node.group.classList.toggle("kpt-selected", isSelected);
            node.group.classList.toggle("kpt-dim", rows.size > 0 && !isSelected);
            node.group.setAttribute("aria-selected", isSelected ? "true" : "false");
        }
    };
    setSelection(selected);

    host.appendChild(svg);
    return { svg, nodes, setSelection };
}

/** Optional legend of the chart series. */
export function renderLegend(ctx: RenderContext): HTMLElement {
    const { settings, data, theme, plan } = ctx;
    const c = settings.chart;
    const legend = el("div", "kpt-legend");
    applyFont(legend, c.labelFont, theme.text(c.labelColor), plan.textScale, 8);
    const item = (label: string, fill: string, border: string | null, dashed = false) => {
        const node = el("span", "kpt-legend-item");
        const swatch = el("span", "kpt-swatch");
        swatch.style.backgroundColor = fill;
        if (border) {
            swatch.style.border = `1px ${dashed ? "dashed" : "solid"} ${border}`;
        }
        node.appendChild(swatch);
        node.appendChild(el("span", undefined, label));
        legend.appendChild(node);
    };
    const soft = theme.softMark(c.previousYearColor);
    if (c.previousYearShow && data.bound.previousYearValue) {
        item(c.previousYearLabel, soft.fill, soft.stroke);
    }
    item(data.bound.actualValue ? c.actualLabel : (data.names.primaryValue ?? c.actualLabel), theme.mark(c.actualColor), null);
    if (data.periods.some(p => p.chartRemaining > 0)) {
        item(c.remainingLabel, theme.surface(c.projectionColor), theme.line(c.projectionBorderColor), true);
    }
    return legend;
}

/** Discreet message shown in the chart area when there is no history (spec 23.5). */
export function renderChartMessage(text: string, ctx: RenderContext): HTMLElement {
    const node = el("div", "kpt-chart-message", text);
    applyFont(node, ctx.settings.chart.labelFont, ctx.theme.text(ctx.settings.chart.labelColor), ctx.plan.textScale, 9);
    return node;
}
