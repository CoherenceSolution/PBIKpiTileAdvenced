/**
 * Interactions with the Power BI host (spec 16): period selection through the Selection Manager
 * (cross-filter / cross-highlight of the other visuals), context menu (drill-through, copy, ...)
 * and URL launching. The visual never navigates or calls the network by itself.
 */
import powerbi from "powerbi-visuals-api";

import { isSafeUrl } from "./utils";

import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;

export class InteractionManager {
    private readonly selectionManager: ISelectionManager;
    private readonly ids = new Map<number, ISelectionId>();
    private selected = new Set<number>();

    /** Called whenever the set of selected periods changes (click, keyboard, bookmark). */
    public onSelectionChanged: (() => void) | null = null;

    constructor(private readonly host: IVisualHost) {
        this.selectionManager = host.createSelectionManager();
        // Bookmarks and "clear selection" coming from the host.
        this.selectionManager.registerOnSelectCallback((ids: powerbi.extensibility.ISelectionId[]) => {
            this.syncFrom(ids as ISelectionId[]);
            this.onSelectionChanged?.();
        });
    }

    /** False in contexts where the host forbids interactions (e.g. a dashboard tile). */
    public get allowInteractions(): boolean {
        return this.host.hostCapabilities?.allowInteractions !== false;
    }

    public get selectedRows(): ReadonlySet<number> {
        return this.selected;
    }

    public idOf(row: number | null | undefined): ISelectionId | undefined {
        return row === null || row === undefined ? undefined : this.ids.get(row);
    }

    /** Rebuilds one selection identity per row of the Period category. */
    public bind(dataView: powerbi.DataView | undefined | null): void {
        this.ids.clear();
        const categories = dataView?.categorical?.categories ?? [];
        const category = categories.find(c => c.source?.roles?.["period"]) ?? categories[0];
        if (category) {
            for (let row = 0; row < category.values.length; row++) {
                this.ids.set(row, this.host.createSelectionIdBuilder().withCategory(category, row).createSelectionId());
            }
        }
        this.syncFrom(this.selectionManager.getSelectionIds() as ISelectionId[]);
    }

    private syncFrom(ids: ISelectionId[] | undefined | null): void {
        const next = new Set<number>();
        if (ids && ids.length > 0) {
            this.ids.forEach((id, row) => {
                if (ids.some(candidate => candidate && typeof candidate.equals === "function" && candidate.equals(id))) {
                    next.add(row);
                }
            });
        }
        this.selected = next;
    }

    /** Click on a period: selects it, or toggles it when multi-selection is requested. */
    public toggle(row: number, multiSelect: boolean): void {
        if (!this.allowInteractions || !this.ids.has(row)) {
            return;
        }
        const next = new Set<number>(multiSelect ? this.selected : []);
        if (this.selected.has(row) && (multiSelect || this.selected.size === 1)) {
            next.delete(row);
        } else {
            next.add(row);
        }
        this.apply(next);
    }

    public clear(): void {
        if (this.selected.size > 0) {
            this.apply(new Set<number>());
        }
    }

    private apply(next: Set<number>): void {
        this.selected = next;
        const ids: ISelectionId[] = [];
        next.forEach(row => {
            const id = this.ids.get(row);
            if (id) {
                ids.push(id);
            }
        });
        try {
            if (ids.length === 0) {
                this.selectionManager.clear();
            } else {
                this.selectionManager.select(ids, false);
            }
        } catch {
            // selection is a best-effort feature: never break the rendering
        }
        this.onSelectionChanged?.();
    }

    /** Native context menu of Power BI (includes drill-through when configured on the page). */
    public showContextMenu(row: number | null, x: number, y: number): void {
        const id = row === null ? undefined : this.ids.get(row);
        try {
            this.selectionManager.showContextMenu(id ?? {}, { x, y });
        } catch {
            // not available in every host
        }
    }

    /** Opens an http(s) URL through the host, which asks the user for confirmation. */
    public openUrl(url: string | null | undefined): boolean {
        if (!isSafeUrl(url)) {
            return false;
        }
        try {
            this.host.launchUrl(url.trim());
            return true;
        } catch {
            return false;
        }
    }
}
