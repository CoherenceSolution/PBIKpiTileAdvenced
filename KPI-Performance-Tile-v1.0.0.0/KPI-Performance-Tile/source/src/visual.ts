/**
 * KPI Performance Tile - Power BI custom visual.
 *
 * One instance = one KPI. Power BI computes the business values (DAX); the visual presents them,
 * colors the status badge and handles the interactions.
 *
 * This class only orchestrates: data conversion, layout and painting live in dedicated modules.
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import { Theme, createTheme, enableRovingFocus, makeActivable, prefersReducedMotion } from "./accessibilityManager";
import { ChartFlags, ChartHandle, renderChart, renderChartMessage, renderLegend } from "./chartRenderer";
import { renderComparison } from "./comparisonRenderer";
import { convert } from "./dataConverter";
import { powerBiEngine } from "./formatEngine";
import { buildFormattingModel } from "./formattingSettings";
import { renderHeader } from "./headerRenderer";
import { createIcon } from "./icons";
import { InteractionManager } from "./interactionManager";
import { renderLanding } from "./landingPage";
import { CHART_MIN_HEIGHT, LayoutPlan, SacrificeKey, computeLayout } from "./layoutEngine";
import { formatRawValue, setFormatEngine } from "./numberFormat";
import { RenderContext } from "./renderContext";
import { defaultSettings, resolveSettings } from "./settingsResolver";
import { TileSettings } from "./settingsSchema";
import { computeStatus } from "./status";
import { renderStatusBadge } from "./statusBadgeRenderer";
import { TooltipManager, buildHeaderTooltip, buildPeriodTooltip } from "./tooltipManager";
import { applyFont, clearNode, el, uniqueId } from "./utils";
import { fitMainValue, renderValue } from "./valueRenderer";
import { buildView, createFormatters } from "./viewModel";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

/** Space kept between the title block and the main value. */
const SPACER_MIN = 4;
const SHADOW_MARGIN = 4;

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly element: HTMLElement;
    private readonly root: HTMLElement;
    private readonly events: IVisualEventService | undefined;
    private readonly formattingService: FormattingSettingsService;
    /** True when the labels of the format pane are resolved by the host localization manager. */
    private readonly localized: boolean;
    private readonly interactions: InteractionManager;
    private readonly tooltips: TooltipManager;
    private readonly disposers: Array<() => void> = [];

    private settings: TileSettings = defaultSettings();
    private dataView: powerbi.DataView | undefined;
    private viewport: powerbi.IViewport = { width: 0, height: 0 };
    private context: RenderContext | null = null;
    private chart: ChartHandle | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.element = options.element;
        this.events = options.host.eventService;
        // Labels of the format pane go through the host localization manager (spec 22.3).
        let localizationManager: powerbi.extensibility.ILocalizationManager | undefined;
        try {
            localizationManager = this.host.createLocalizationManager();
        } catch {
            localizationManager = undefined;
        }
        this.localized = !!localizationManager && typeof localizationManager.getDisplayName === "function";
        this.formattingService = new FormattingSettingsService(this.localized ? localizationManager : undefined);

        // Format strings inherited from the measures are rendered by the official Power BI formatter.
        setFormatEngine(powerBiEngine);

        this.root = el("div", "kpt-root");
        this.element.appendChild(this.root);

        this.interactions = new InteractionManager(this.host);
        this.interactions.onSelectionChanged = () => this.onSelectionChanged();
        this.tooltips = new TooltipManager(this.host.tooltipService, this.root);

        this.listen(this.root, "click", event => this.onTileClick(event as MouseEvent));
        this.listen(this.root, "contextmenu", event => this.onContextMenu(event as MouseEvent));
        this.listen(this.root, "keydown", event => this.onKeyDown(event as KeyboardEvent));
    }

    // ------------------------------------------------------------------ IVisual

    public update(options: VisualUpdateOptions): void {
        this.events?.renderingStarted(options);
        try {
            this.dataView = options.dataViews && options.dataViews.length > 0 ? options.dataViews[0] : undefined;
            this.viewport = options.viewport ?? this.viewport;
            this.settings = resolveSettings(this.dataView?.metadata?.objects as Parameters<typeof resolveSettings>[0]);
            this.render();
            this.events?.renderingFinished(options);
        } catch (error) {
            this.events?.renderingFailed(options, String(error));
        }
    }

    /** Modern format pane (spec 19). */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return buildFormattingModel(this.settings, this.formattingService, this.localized);
    }

    public destroy(): void {
        this.tooltips.hide();
        this.interactions.onSelectionChanged = null;
        while (this.disposers.length > 0) {
            const dispose = this.disposers.pop();
            if (dispose) {
                dispose();
            }
        }
        clearNode(this.root);
        this.context = null;
        this.chart = null;
    }

    // ------------------------------------------------------------------ rendering

    private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
        target.addEventListener(type, handler);
        this.disposers.push(() => target.removeEventListener(type, handler));
    }

    private render(): void {
        const settings = this.settings;
        const locale = this.host.locale;
        const focusedRow = this.focusedRow();

        this.tooltips.hide();
        this.interactions.bind(this.dataView);

        const data = convert(this.dataView, settings, {
            formatRaw: (value, format) => formatRawValue(value, format, locale),
            selectedRows: this.interactions.selectedRows
        });
        const theme = createTheme(this.host.colorPalette, settings);
        const plan = computeLayout(this.viewport, settings);

        clearNode(this.root);
        this.chart = null;
        this.context = null;
        this.applyTileStyle(theme, plan);

        if (!data.hasData) {
            this.root.removeAttribute("role");
            this.root.removeAttribute("tabindex");
            this.root.removeAttribute("aria-label");
            this.root.removeAttribute("aria-describedby");
            renderLanding(this.root, theme, this.viewport.width, this.viewport.height);
            return;
        }

        const status = computeStatus(data, settings);
        const view = buildView(data, settings, status, locale);
        const ctx: RenderContext = {
            settings, data, view, plan, theme, locale,
            formatters: createFormatters(data, settings, locale)
        };
        this.context = ctx;
        const root = this.root;

        // ---- accessible name and description of the tile
        root.setAttribute("role", "group");
        root.setAttribute("aria-label", view.ariaLabel);
        const description = el("span", "kpt-sr-only", view.ariaDescription);
        description.id = uniqueId("kpt-description");
        root.setAttribute("aria-describedby", description.id);
        root.appendChild(description);

        // ---- static structure, top to bottom (spec 32)
        const header = renderHeader(ctx);
        root.appendChild(header.root);

        const spacer = el("div", "kpt-spacer");
        root.appendChild(spacer);

        const value = renderValue(ctx);
        root.appendChild(value.root);

        const badge = renderStatusBadge(ctx);
        const comparison1 = plan.show.comparison1 ? renderComparison(view.comparison1, ctx) : null;
        const comparison2 = plan.show.comparison2 ? renderComparison(view.comparison2, ctx) : null;
        const statusRow = el("div", "kpt-status-row");
        if (badge) {
            statusRow.appendChild(badge);
        }
        const ownLines: HTMLElement[] = [];
        const place = (node: HTMLElement | null, position: "inline" | "ownLine") => {
            if (!node) {
                return;
            }
            if (position === "inline") {
                if (badge) {
                    node.classList.add("kpt-push");
                }
                statusRow.appendChild(node);
            } else {
                node.classList.add("kpt-own-line");
                ownLines.push(node);
            }
        };
        place(comparison1, settings.comparison1.position);
        place(comparison2, settings.comparison2.position);
        if (statusRow.childNodes.length > 0) {
            root.appendChild(statusRow);
        }
        ownLines.forEach(node => root.appendChild(node));

        const wantsChart = plan.show.chart;
        const legend = wantsChart && plan.show.legend && !view.chartMessage ? renderLegend(ctx) : null;
        if (legend) {
            root.appendChild(legend);
        }
        const chartHost = el("div", "kpt-chart");
        chartHost.style.height = "0px";
        if (wantsChart) {
            root.appendChild(chartHost);
        }

        const footer = this.renderFooter(ctx);
        if (footer.root) {
            root.appendChild(footer.root);
        }

        // ---- sizes: the main value is fitted first because its height drives the rest
        fitMainValue(value.value, settings.mainValue.valueAutoSize);

        const flags: Record<SacrificeKey, boolean> = { ...plan.show };
        const targets: Partial<Record<SacrificeKey, HTMLElement | null>> = {
            legend,
            subtitle: header.subtitle,
            caption: footer.caption,
            comparison1,
            comparison2,
            secondary: value.secondary,
            target: value.target,
            category: header.category,
            chart: chartHost
        };
        const tidyRows = (): void => {
            const visible = (row: HTMLElement) => Array.from(row.children).some(child => (child as HTMLElement).style.display !== "none");
            statusRow.style.display = visible(statusRow) ? "" : "none";
            if (header.topRow) {
                header.topRow.style.display = visible(header.topRow) ? "" : "none";
            }
        };
        const setShown = (key: SacrificeKey, shown: boolean): void => {
            flags[key] = shown;
            const node = targets[key];
            if (node) {
                node.style.display = shown ? "" : "none";
            }
            if (key === "chart" && legend) {
                legend.style.display = shown && flags.legend ? "" : "none";
            }
            tidyRows();
        };

        // Elements are hidden progressively (spec 20) until the chart gets its minimum height.
        let chartHeight = 0;
        if (wantsChart) {
            const hasOpenPeriod = data.periods.some(p => p.isOpen);
            const labelsHeight = 26;
            const maxChart = Math.max(56, Math.min(190, this.viewport.width * 0.26)) + labelsHeight;
            const hidden: SacrificeKey[] = [];
            const queue = plan.sacrifices.filter(key => key !== "chart");
            for (let guard = 0; guard < 16; guard++) {
                const available = spacer.getBoundingClientRect().height - SPACER_MIN;
                let minimum: number = CHART_MIN_HEIGHT.barsOnly;
                if (view.chartMessage) {
                    minimum = 22;
                } else if (flags.periodLabels) {
                    minimum = CHART_MIN_HEIGHT.withLabels + (flags.currentIndicator && hasOpenPeriod ? 10 : 0);
                }
                if (available >= minimum) {
                    chartHeight = Math.floor(Math.min(available, view.chartMessage ? 40 : maxChart));
                    break;
                }
                const key = queue.shift();
                if (!key) {
                    break;
                }
                hidden.push(key);
                setShown(key, false);
            }
            if (chartHeight === 0) {
                // The chart cannot fit whatever is hidden: drop it and give the room back to the texts.
                hidden.forEach(key => setShown(key, plan.show[key]));
                setShown("chart", false);
            }
        }

        // Last resort against vertical overflow: same priorities, then a single-line title and no footer.
        const overflows = () => root.scrollHeight > root.clientHeight + 1;
        const textQueue = plan.sacrifices.filter(key => flags[key] && !!targets[key] && key !== "chart" && key !== "legend");
        while (overflows() && textQueue.length > 0) {
            setShown(textQueue.shift() as SacrificeKey, false);
        }
        if (overflows()) {
            root.classList.add("kpt-tight");
        }
        if (overflows() && header.title) {
            header.title.style.display = "block";
            header.title.style.whiteSpace = "nowrap";
            header.title.style.textOverflow = "ellipsis";
        }
        if (overflows() && footer.root) {
            footer.root.style.display = "none";
        }

        // An inline comparison that wrapped under the badge is left-aligned.
        if (badge) {
            [comparison1, comparison2].forEach(node => {
                if (node && node.classList.contains("kpt-push") && node.offsetTop > badge.offsetTop + badge.offsetHeight / 2) {
                    node.classList.remove("kpt-push");
                }
            });
        }

        if (wantsChart && flags.chart && chartHeight > 0) {
            chartHost.style.height = `${chartHeight}px`;
            if (view.chartMessage) {
                chartHost.appendChild(renderChartMessage(view.chartMessage, ctx));
            } else {
                const chartFlags: ChartFlags = {
                    periodLabels: flags.periodLabels,
                    currentIndicator: flags.currentIndicator,
                    dataLabels: flags.dataLabels,
                    gridlines: plan.show.gridlines
                };
                const width = Math.max(10, Math.floor(chartHost.getBoundingClientRect().width));
                this.chart = renderChart(chartHost, width, chartHeight, chartFlags, ctx, this.interactions.selectedRows);
                this.bindChart(this.chart, ctx, focusedRow);
            }
        }

        // ---- interactions of the static parts
        const referenceId = this.interactions.idOf(data.reference?.rowIndex);
        this.tooltips.attach(value.root, () => ({
            items: buildHeaderTooltip(ctx),
            identities: referenceId ? [referenceId] : []
        }));

        const tileAction = settings.interaction.tileAction;
        const clickable = tileAction !== "none" && this.interactions.allowInteractions;
        root.classList.toggle("kpt-clickable", clickable);
        if (clickable && settings.accessibility.keyboardFocus) {
            root.setAttribute("tabindex", "0");
        } else {
            root.removeAttribute("tabindex");
        }
    }

    private applyTileStyle(theme: Theme, plan: LayoutPlan): void {
        const tile = this.settings.tile;
        const root = this.root;
        const margin = tile.shadow && !theme.highContrast ? SHADOW_MARGIN : 0;
        const interaction = this.settings.interaction;
        const selectable = interaction.selectionEnabled && this.interactions.allowInteractions;

        root.className = "kpt-root";
        root.classList.add(`kpt-mode-${plan.mode}`);
        root.classList.toggle("kpt-shadow", margin > 0);
        root.classList.toggle("kpt-hoverable", interaction.hoverStyle && selectable);
        root.classList.toggle("kpt-static", !selectable);
        root.classList.toggle("kpt-high-contrast", theme.highContrast);
        root.classList.toggle("kpt-reduce-motion", this.settings.accessibility.reduceMotion || prefersReducedMotion());

        root.style.width = `${Math.max(0, this.viewport.width - margin * 2)}px`;
        root.style.height = `${Math.max(0, this.viewport.height - margin * 2)}px`;
        root.style.margin = `${margin}px`;
        root.style.padding = `${plan.padding}px`;
        root.style.backgroundColor = theme.tileBackground;
        root.style.borderRadius = `${tile.borderRadius}px`;
        if (theme.highContrast) {
            root.style.border = `1px solid ${theme.foreground}`;
        } else if (tile.borderShow && tile.borderWidth > 0) {
            root.style.border = `${tile.borderWidth}px solid ${theme.line(tile.borderColor)}`;
        } else {
            root.style.border = "none";
        }
        root.style.setProperty("--kpt-focus", theme.focus);
    }

    private renderFooter(ctx: RenderContext): { root: HTMLElement | null; caption: HTMLElement | null; details: HTMLElement | null } {
        const { settings, view, plan, theme, data } = ctx;
        const showCaption = plan.show.chart && plan.show.caption && !!view.caption && !view.chartMessage;
        const showDetails = plan.show.details;
        const warnings = settings.tile.showWarnings ? data.warnings : [];
        if (!showCaption && !showDetails && warnings.length === 0) {
            return { root: null, caption: null, details: null };
        }

        const footer = el("div", "kpt-footer");
        const left = el("div", "kpt-footer-left");
        footer.appendChild(left);

        let caption: HTMLElement | null = null;
        if (showCaption && view.caption) {
            caption = el("span", "kpt-caption", view.caption);
            applyFont(caption, settings.chart.labelFont, theme.text(settings.chart.labelColor), plan.textScale * 1.15, 9);
            left.appendChild(caption);
        }

        if (warnings.length > 0) {
            // Clear but non-blocking data warning (spec 23.8).
            const warning = el("span", "kpt-warning");
            const icon = createIcon("warning", 14);
            if (icon) {
                warning.appendChild(icon);
            }
            if (theme.highContrast) {
                warning.style.color = theme.foreground;
            }
            warning.style.setProperty("--kpt-icon-knockout", theme.contrastBackground);
            warning.title = warnings.join("\n");
            warning.setAttribute("role", "img");
            warning.setAttribute("tabindex", "0");
            warning.setAttribute("aria-label", `Data warning: ${warnings.join(" ")}`);
            left.appendChild(warning);
        }

        let details: HTMLElement | null = null;
        if (showDetails) {
            const d = settings.details;
            const text = d.detailsText || "Details";
            details = el("div", "kpt-details", text);
            applyFont(details, d.detailsFont, theme.link(d.detailsColor), plan.textScale, 9);
            details.style.minWidth = `${Math.min(d.detailsMinWidth, Math.max(40, this.viewport.width * 0.5))}px`;
            details.classList.toggle("kpt-hover-underline", d.detailsUnderlineOnHover);
            const activate = (event: Event) => this.onDetails(event);
            details.addEventListener("click", activate);
            if (settings.accessibility.keyboardFocus) {
                makeActivable(details, d.detailsAction === "url" ? "link" : "button", text.replace(/[←-⇿➔-➿>]+\s*$/, "").trim() || "Details", activate);
            }
            footer.appendChild(details);
        }
        return { root: footer, caption, details };
    }

    // ------------------------------------------------------------------ interactions

    private bindChart(chart: ChartHandle, ctx: RenderContext, focusedRow: number | null): void {
        const interaction = ctx.settings.interaction;
        const selectable = interaction.selectionEnabled && this.interactions.allowInteractions;

        chart.nodes.forEach(node => {
            const row = node.point.rowIndex;
            this.tooltips.attach(node.group, () => {
                const id = this.interactions.idOf(row);
                return { items: buildPeriodTooltip(node.point, ctx), identities: id ? [id] : [] };
            });
            if (selectable) {
                node.group.addEventListener("click", (event: MouseEvent) => {
                    event.stopPropagation();
                    this.interactions.toggle(row, interaction.multiSelect && (event.ctrlKey || event.metaKey || event.shiftKey));
                });
            }
        });

        if (ctx.settings.accessibility.keyboardFocus) {
            const groups = chart.nodes.map(node => node.group);
            const focusIndex = focusedRow === null ? -1 : chart.nodes.findIndex(node => node.point.rowIndex === focusedRow);
            enableRovingFocus(groups, {
                onActivate: (index, event) => {
                    if (selectable) {
                        this.interactions.toggle(chart.nodes[index].point.rowIndex, interaction.multiSelect && (event.ctrlKey || event.metaKey || event.shiftKey));
                    }
                }
            }, focusIndex === -1 ? groups.length - 1 : focusIndex);
            if (focusIndex !== -1) {
                (groups[focusIndex] as unknown as HTMLElement).focus();
            }
        }
    }

    /** Row of the period that currently has the keyboard focus, to restore it after a re-render. */
    private focusedRow(): number | null {
        const active = document.activeElement;
        if (active && this.root.contains(active)) {
            const row = active.getAttribute("data-row");
            if (row !== null && row !== "") {
                return Number(row);
            }
        }
        return null;
    }

    private onSelectionChanged(): void {
        if (this.settings.chart.headerPeriod === "selected") {
            // The header follows the selected bar: the whole tile is repainted.
            this.render();
        } else if (this.chart) {
            // Only the bars change: no need to rebuild the tile.
            this.chart.setSelection(this.interactions.selectedRows);
        }
    }

    private toggleReference(): void {
        const row = this.context?.data.reference?.rowIndex;
        if (row !== undefined) {
            this.interactions.toggle(row, false);
        }
    }

    /** Click on the tile, outside the bars and the Details zone (spec 16.3). */
    private onTileClick(event: MouseEvent): void {
        const ctx = this.context;
        if (!ctx || !this.interactions.allowInteractions) {
            return;
        }
        switch (ctx.settings.interaction.tileAction) {
            case "url":
                this.interactions.openUrl(ctx.view.actionUrl);
                break;
            case "select":
            case "hostEvent":
                // The selection is forwarded to the host: in Power BI Embedded the application
                // receives a "dataSelected" event and can call report.setPage().
                this.toggleReference();
                break;
            default:
                if (ctx.settings.interaction.selectionEnabled && !(event.ctrlKey || event.metaKey)) {
                    this.interactions.clear();
                }
                break;
        }
    }

    private onDetails(event: Event): void {
        event.stopPropagation();
        const ctx = this.context;
        if (!ctx || !this.interactions.allowInteractions) {
            return;
        }
        switch (ctx.settings.details.detailsAction) {
            case "url":
                this.interactions.openUrl(ctx.view.actionUrl);
                break;
            case "select":
                this.toggleReference();
                break;
            case "contextMenu": {
                const target = event.currentTarget as HTMLElement | null;
                const rect = target ? target.getBoundingClientRect() : this.root.getBoundingClientRect();
                const mouse = event as MouseEvent;
                const x = mouse.clientX || rect.left + rect.width / 2;
                const y = mouse.clientY || rect.top + rect.height / 2;
                this.interactions.showContextMenu(ctx.data.reference?.rowIndex ?? null, x, y);
                break;
            }
            default:
                // "none": a transparent Power BI button laid over the zone handles the navigation.
                break;
        }
    }

    private onContextMenu(event: MouseEvent): void {
        const target = event.target as Element | null;
        const period = target && typeof target.closest === "function" ? target.closest(".kpt-period") : null;
        const rowText = period ? period.getAttribute("data-row") : null;
        this.interactions.showContextMenu(rowText !== null && rowText !== "" ? Number(rowText) : null, event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.interactions.clear();
            return;
        }
        if (event.target === this.root && (event.key === "Enter" || event.key === " " || event.key === "Spacebar")) {
            event.preventDefault();
            this.onTileClick(event as unknown as MouseEvent);
        }
    }
}
