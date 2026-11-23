/**
 * Accessibility helpers (spec 21): high-contrast theme, minimum contrast, keyboard navigation.
 */
import { TileSettings } from "./settingsSchema";
import { ensureContrast, parseColor, withTransparency } from "./utils";

/** Subset of the host color palette used by the visual. */
export interface HostPalette {
    isHighContrast?: boolean;
    foreground?: { value: string };
    background?: { value: string };
    foregroundSelected?: { value: string };
    hyperlink?: { value: string };
}

export interface Theme {
    highContrast: boolean;
    /** Background of the tile as painted (may be translucent). */
    tileBackground: string;
    /** Opaque color used for contrast computations. */
    contrastBackground: string;
    foreground: string;
    focus: string;
    /** Text color, adjusted for high contrast and minimum contrast. */
    text(color: string, background?: string): string;
    link(color: string): string;
    /** Main marks (actual bars). */
    mark(color: string): string;
    /** Secondary marks (previous year): hollow in high contrast. */
    softMark(color: string): { fill: string; stroke: string | null };
    line(color: string): string;
    /** Background of badges and boxes. */
    surface(color: string): string;
}

export function createTheme(palette: HostPalette | undefined | null, settings: TileSettings): Theme {
    const highContrast = !!palette?.isHighContrast;
    const hcForeground = palette?.foreground?.value ?? "#FFFFFF";
    const hcBackground = palette?.background?.value ?? "#000000";
    const hcLink = palette?.hyperlink?.value ?? hcForeground;
    const hcSelected = palette?.foregroundSelected?.value ?? hcForeground;

    const tile = settings.tile;
    const opaqueBackground = tile.backgroundTransparency >= 60 || !parseColor(tile.backgroundColor) ? "#FFFFFF" : tile.backgroundColor;
    const enforce = settings.accessibility.enforceContrast;

    if (highContrast) {
        return {
            highContrast,
            tileBackground: hcBackground,
            contrastBackground: hcBackground,
            foreground: hcForeground,
            focus: hcSelected,
            text: () => hcForeground,
            link: () => hcLink,
            mark: () => hcForeground,
            softMark: () => ({ fill: hcBackground, stroke: hcForeground }),
            line: () => hcForeground,
            surface: () => hcBackground
        };
    }

    return {
        highContrast,
        tileBackground: withTransparency(tile.backgroundColor, tile.backgroundTransparency),
        contrastBackground: opaqueBackground,
        foreground: "#1F2523",
        focus: settings.accessibility.focusColor,
        text: (color, background) => (enforce ? ensureContrast(color, background ?? opaqueBackground, 4.5) : color),
        link: color => (enforce ? ensureContrast(color, opaqueBackground, 4.5) : color),
        mark: color => color,
        softMark: color => ({ fill: color, stroke: null }),
        line: color => color,
        surface: color => color
    };
}

export interface RovingOptions {
    onActivate(index: number, event: KeyboardEvent): void;
    onEscape?(): void;
}

/**
 * Roving tabindex over a list of focusable elements: Tab enters / leaves the group,
 * arrows, Home and End move inside it, Enter and Space activate.
 */
export function enableRovingFocus(items: ReadonlyArray<HTMLElement | SVGElement>, options: RovingOptions, initialIndex = 0): void {
    if (items.length === 0) {
        return;
    }
    const start = Math.max(0, Math.min(items.length - 1, initialIndex));
    items.forEach((item, index) => {
        item.setAttribute("tabindex", index === start ? "0" : "-1");
        item.addEventListener("keydown", (event: Event) => {
            const key = (event as KeyboardEvent).key;
            let next = -1;
            if (key === "ArrowRight" || key === "ArrowDown") {
                next = Math.min(items.length - 1, index + 1);
            } else if (key === "ArrowLeft" || key === "ArrowUp") {
                next = Math.max(0, index - 1);
            } else if (key === "Home") {
                next = 0;
            } else if (key === "End") {
                next = items.length - 1;
            } else if (key === "Enter" || key === " " || key === "Spacebar") {
                event.preventDefault();
                event.stopPropagation();
                options.onActivate(index, event as KeyboardEvent);
                return;
            } else if (key === "Escape" && options.onEscape) {
                options.onEscape();
                return;
            }
            if (next !== -1) {
                event.preventDefault();
                event.stopPropagation();
                items.forEach((other, otherIndex) => other.setAttribute("tabindex", otherIndex === next ? "0" : "-1"));
                (items[next] as HTMLElement).focus();
            }
        });
    });
}

/** Makes a non-button element behave like a button for keyboard users. */
export function makeActivable(node: HTMLElement, role: "button" | "link", label: string, onActivate: (event: Event) => void): void {
    node.setAttribute("role", role);
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", label);
    node.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
            event.preventDefault();
            event.stopPropagation();
            onActivate(event);
        }
    });
}

export function prefersReducedMotion(): boolean {
    try {
        return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
}
