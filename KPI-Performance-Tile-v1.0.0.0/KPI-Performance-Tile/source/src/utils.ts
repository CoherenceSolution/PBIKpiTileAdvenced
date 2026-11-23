/**
 * Small DOM, color and text helpers shared by the renderers.
 * No innerHTML anywhere: every node is created through the DOM API.
 */
import { FontValue } from "./settingsSchema";

const SVG_NS = "http://www.w3.org/2000/svg";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    for (const key of Object.keys(attributes)) {
        node.setAttribute(key, String(attributes[key]));
    }
    return node;
}

export function clearNode(node: Node): void {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

/** Power BI format pane sizes are expressed in points. */
export function ptToPx(pt: number): number {
    return Math.round(pt * 4 / 3 * 100) / 100;
}

export function applyFont(node: HTMLElement | SVGElement, font: FontValue, color: string, scale = 1, minPx = 0): number {
    const px = Math.max(minPx, Math.round(ptToPx(font.size) * scale * 10) / 10);
    node.style.fontFamily = font.family;
    node.style.fontSize = `${px}px`;
    node.style.fontWeight = font.bold ? "700" : "400";
    node.style.fontStyle = font.italic ? "italic" : "normal";
    node.style.textDecoration = font.underline ? "underline" : "none";
    if (node instanceof SVGElement) {
        node.style.fill = color;
    } else {
        node.style.color = color;
    }
    return px;
}

/** Limits a block of text to a number of lines, with an ellipsis. */
export function clampLines(node: HTMLElement, lines: number): void {
    if (lines <= 1) {
        node.style.whiteSpace = "nowrap";
        node.style.overflow = "hidden";
        node.style.textOverflow = "ellipsis";
        return;
    }
    node.style.display = "-webkit-box";
    node.style.setProperty("-webkit-line-clamp", String(lines));
    node.style.setProperty("-webkit-box-orient", "vertical");
    node.style.overflow = "hidden";
    node.style.overflowWrap = "anywhere";
}

// ------------------------------------------------------------------ colors

export interface Rgb { r: number; g: number; b: number }

export function parseColor(color: string): Rgb | null {
    const text = color.trim();
    let match = /^#([0-9a-f]{3})$/i.exec(text);
    if (match) {
        const [r, g, b] = match[1].split("").map(c => parseInt(c + c, 16));
        return { r, g, b };
    }
    match = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(text);
    if (match) {
        const value = parseInt(match[1], 16);
        return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
    }
    match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    if (match) {
        return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
    }
    return null;
}

export function toHex(rgb: Rgb): string {
    const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`.toUpperCase();
}

/** CSS color with a Power BI style transparency (0 = opaque, 100 = invisible). */
export function withTransparency(color: string, transparency: number): string {
    const rgb = parseColor(color);
    if (!rgb) {
        return color;
    }
    const alpha = Math.max(0, Math.min(1, 1 - transparency / 100));
    return alpha >= 1 ? toHex(rgb) : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.round(alpha * 1000) / 1000})`;
}

export function relativeLuminance(rgb: Rgb): number {
    const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio (1 to 21). Returns null when a color cannot be parsed. */
export function contrastRatio(foreground: string, background: string): number | null {
    const fg = parseColor(foreground);
    const bg = parseColor(background);
    if (!fg || !bg) {
        return null;
    }
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Returns the foreground color, darkened or lightened just enough to reach the minimum
 * contrast ratio against the background (4.5:1 by default, WCAG AA for normal text).
 */
export function ensureContrast(foreground: string, background: string, minimum = 4.5): string {
    const fg = parseColor(foreground);
    const bg = parseColor(background);
    if (!fg || !bg) {
        return foreground;
    }
    const current = contrastRatio(foreground, background) ?? 21;
    if (current >= minimum) {
        return foreground;
    }
    const target = relativeLuminance(bg) > 0.4 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    for (let step = 1; step <= 20; step++) {
        const t = step / 20;
        const mixed = {
            r: fg.r + (target.r - fg.r) * t,
            g: fg.g + (target.g - fg.g) * t,
            b: fg.b + (target.b - fg.b) * t
        };
        const hex = toHex(mixed);
        if ((contrastRatio(hex, background) ?? 21) >= minimum) {
            return hex;
        }
    }
    return toHex(target);
}

// ------------------------------------------------------------------ misc

/** Only http(s) URLs are ever handed to the host. */
export function isSafeUrl(url: string | null | undefined): url is string {
    if (!url) {
        return false;
    }
    return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

/** Rough text width estimation (no DOM measurement), good enough to decide label density. */
export function estimateTextWidth(text: string, fontPx: number, bold = false): number {
    let units = 0;
    for (const char of text) {
        if (char === " " || char === "'" || char === "." || char === "," || char === "i" || char === "l" || char === "I") {
            units += 0.3;
        } else if (char >= "0" && char <= "9") {
            units += 0.56;
        } else if (char === "M" || char === "W" || char === "m" || char === "w" || char === "%") {
            units += 0.85;
        } else if (char >= "A" && char <= "Z") {
            units += 0.66;
        } else {
            units += 0.53;
        }
    }
    return units * fontPx * (bold ? 1.06 : 1);
}

let idCounter = 0;
export function uniqueId(prefix: string): string {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}
