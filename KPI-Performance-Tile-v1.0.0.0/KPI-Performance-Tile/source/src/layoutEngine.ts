/**
 * Responsive rules of the tile (spec 20) and geometry of the mini chart.
 * Pure module: no DOM access, everything is computed from sizes and settings.
 */
import { TileSettings } from "./settingsSchema";
import { LayoutMode, PeriodPoint } from "./types";
import { estimateTextWidth } from "./utils";

export interface Viewport { width: number; height: number }

export type SacrificeKey =
    | "legend" | "dataLabels" | "subtitle" | "caption" | "currentIndicator" | "comparison2"
    | "periodLabels" | "secondary" | "target" | "category" | "comparison1" | "chart";

export interface LayoutPlan {
    mode: LayoutMode;
    /** Inner padding of the tile, in px. */
    padding: number;
    /** Scale applied to the main value when auto-size is on. */
    valueScale: number;
    /** Scale applied to the other texts. */
    textScale: number;
    show: Record<SacrificeKey, boolean> & { gridlines: boolean; details: boolean };
    /** Elements hidden one after the other while the chart lacks vertical room. */
    sacrifices: SacrificeKey[];
}

export const BREAKPOINTS = { compact: 260, standard: 400, large: 600 } as const;

/** Minimum height of the chart area: below it, secondary elements are hidden one by one. */
export const CHART_MIN_HEIGHT = { withLabels: 58, barsOnly: 30 } as const;

export function resolveMode(width: number, setting: TileSettings["tile"]["layoutMode"]): LayoutMode {
    if (setting !== "auto") {
        return setting;
    }
    if (width < BREAKPOINTS.compact) {
        return "minimal";
    }
    if (width < BREAKPOINTS.standard) {
        return "compact";
    }
    return width < BREAKPOINTS.large ? "standard" : "large";
}

export function computeLayout(viewport: Viewport, settings: TileSettings): LayoutPlan {
    const mode = resolveMode(viewport.width, settings.tile.layoutMode);
    const c = settings.chart;
    const auto = settings.mainValue.valueAutoSize;

    const show: LayoutPlan["show"] = {
        legend: c.legendShow,
        dataLabels: c.dataLabelsShow,
        subtitle: settings.header.subtitleShow,
        caption: c.captionShow,
        currentIndicator: c.currentIndicatorShow,
        comparison1: settings.comparison1.show,
        comparison2: settings.comparison2.show,
        periodLabels: c.periodLabelsShow,
        secondary: settings.mainValue.secondaryShow,
        target: settings.target.targetShow,
        category: settings.header.categoryShow,
        chart: c.chartShow,
        gridlines: c.gridlinesShow,
        details: settings.details.detailsShow
    };

    let padding = settings.tile.padding;
    // The main value grows smoothly with the width (370 px, the reference capture, is almost full size).
    const valueScale = Math.max(0.72, Math.min(1.15, viewport.width / 400));
    let textScale = 1;

    switch (mode) {
        case "minimal":
            // Spec 20: may hide subtitle, second comparison, some chart labels and the category.
            padding = Math.min(padding, 8);
            textScale = 0.94;
            show.subtitle = false;
            show.comparison2 = false;
            show.category = false;
            show.legend = false;
            show.dataLabels = false;
            show.gridlines = false;
            show.caption = false;
            break;
        case "compact":
            padding = Math.min(padding, 12);
            show.legend = false;
            show.dataLabels = false;
            break;
        case "large":
            padding = Math.round(padding * 1.25);
            textScale = 1.05;
            break;
        default:
            break;
    }

    const order: SacrificeKey[] = [
        "legend", "dataLabels", "subtitle", "caption", "currentIndicator", "comparison2",
        "periodLabels", "secondary", "target", "category", "comparison1", "chart"
    ];

    return {
        mode,
        padding,
        valueScale: auto ? valueScale : 1,
        textScale,
        show,
        sacrifices: order.filter(key => show[key])
    };
}

// ------------------------------------------------------------------ period labels

export interface LabelPlan {
    style: "full" | "short";
    /** One label every `step` periods, anchored on the most recent period. */
    step: number;
}

export function planPeriodLabels(
    labels: ReadonlyArray<{ full: string; short: string }>,
    bandWidth: number,
    fontPx: number,
    forceCompact = false
): LabelPlan {
    // Estimated widths are padded: the actual font of the report is not known here.
    const widest = (style: "full" | "short") =>
        labels.reduce((max, label) => Math.max(max, estimateTextWidth(label[style], fontPx) * 1.08), 0);
    const gap = 6;
    if (!forceCompact && widest("full") + gap <= bandWidth) {
        return { style: "full", step: 1 };
    }
    const short = widest("short") + gap;
    if (short <= bandWidth) {
        return { style: "short", step: 1 };
    }
    const step = Math.max(1, Math.ceil(short / Math.max(1, bandWidth)));
    return { style: "short", step: Math.min(step, Math.max(1, labels.length)) };
}

/** True when the label of the period at `index` is drawn (the last period is always labelled). */
export function isLabelled(index: number, count: number, step: number): boolean {
    return (count - 1 - index) % step === 0;
}

// ------------------------------------------------------------------ chart geometry

export interface Rect { x: number; y: number; width: number; height: number }

export interface PeriodGeometry {
    index: number;
    bandX: number;
    bandWidth: number;
    /** Horizontal center of the period (labels). */
    center: number;
    previousYear: Rect | null;
    /** Un-highlighted value, drawn dimmed behind the highlighted one. */
    ghost: Rect | null;
    actual: Rect | null;
    /** Projection Remaining, stacked on the actual bar. Never negative. */
    remaining: Rect | null;
    /** Outline of the whole projected bar (actual + remaining). */
    projected: Rect | null;
    /** Y of the top of the tallest mark of the period (data label anchor). */
    top: number;
}

export interface ChartGeometry {
    baselineY: number;
    periods: PeriodGeometry[];
    domain: { min: number; max: number };
    scale: (value: number) => number;
}

export interface ChartGeometryOptions {
    width: number;
    /** Plot area: y from `top` to `top + height`. */
    top: number;
    height: number;
    layout: "grouped" | "overlay";
    /** Share of each period band left empty, in %. */
    spacing: number;
    barMaxWidth: number;
    showPreviousYear: boolean;
}

export function computeChartGeometry(points: ReadonlyArray<PeriodPoint>, options: ChartGeometryOptions): ChartGeometry {
    const count = points.length;
    const values: number[] = [0];
    for (const p of points) {
        const actual = p.chartActual ?? 0;
        values.push(actual, (p.chartGhost ?? actual) + p.chartRemaining);
        if (p.chartGhost !== null) {
            values.push(p.chartGhost);
        }
        if (options.showPreviousYear && p.previousYear !== null) {
            values.push(p.previousYear);
        }
    }
    let max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min) {
        max = min + 1;
    }

    const height = Math.max(1, options.height);
    const scale = (value: number) => options.top + (max - value) / (max - min) * height;
    const baselineY = scale(0);

    const bandWidth = count > 0 ? options.width / count : options.width;
    const groupWidth = Math.max(2, bandWidth * (1 - Math.max(0, Math.min(90, options.spacing)) / 100));
    const innerGap = options.layout === "grouped" && options.showPreviousYear ? Math.min(3, groupWidth * 0.08) : 0;

    const bar = (x: number, width: number, from: number, to: number): Rect => {
        const y1 = scale(from);
        const y2 = scale(to);
        let top = Math.min(y1, y2);
        let h = Math.abs(y2 - y1);
        if (h < 1 && from !== to) {
            // Keep tiny values visible.
            h = 1;
            top = to > from ? y1 - 1 : y1;
        }
        return { x, y: top, width, height: h };
    };

    const periods: PeriodGeometry[] = points.map((p, index) => {
        const bandX = index * bandWidth;
        const center = bandX + bandWidth / 2;
        let pyRect: Rect | null = null;
        let actualX: number;
        let actualWidth: number;

        if (options.layout === "overlay") {
            const backWidth = Math.min(options.barMaxWidth * 1.5, groupWidth);
            actualWidth = options.showPreviousYear ? Math.max(2, backWidth * 0.55) : Math.min(options.barMaxWidth, groupWidth);
            actualX = center - actualWidth / 2;
            if (options.showPreviousYear && p.previousYear !== null) {
                pyRect = bar(center - backWidth / 2, backWidth, 0, p.previousYear);
            }
        } else if (options.showPreviousYear) {
            const barWidth = Math.max(1, Math.min(options.barMaxWidth, (groupWidth - innerGap) / 2));
            const start = center - (barWidth * 2 + innerGap) / 2;
            actualX = start + barWidth + innerGap;
            actualWidth = barWidth;
            if (p.previousYear !== null) {
                pyRect = bar(start, barWidth, 0, p.previousYear);
            }
        } else {
            actualWidth = Math.max(1, Math.min(options.barMaxWidth, groupWidth));
            actualX = center - actualWidth / 2;
        }

        const actualValue = p.chartActual;
        const actual = actualValue !== null ? bar(actualX, actualWidth, 0, actualValue) : null;
        const ghost = p.chartGhost !== null ? bar(actualX, actualWidth, 0, p.chartGhost) : null;

        let remaining: Rect | null = null;
        let projected: Rect | null = null;
        if (p.chartRemaining > 0) {
            // During cross-highlighting the projection stays on top of the full (un-highlighted) bar.
            const from = p.chartGhost ?? actualValue ?? 0;
            remaining = bar(actualX, actualWidth, from, from + p.chartRemaining);
            projected = bar(actualX, actualWidth, 0, from + p.chartRemaining);
        }

        const tops = [actual, ghost, remaining, pyRect].filter((r): r is Rect => r !== null).map(r => r.y);
        return {
            index,
            bandX,
            bandWidth,
            center,
            previousYear: pyRect,
            ghost,
            actual,
            remaining,
            projected,
            top: tops.length > 0 ? Math.min(...tops) : baselineY
        };
    });

    return { baselineY, periods, domain: { min, max }, scale };
}
