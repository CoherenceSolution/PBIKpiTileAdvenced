/**
 * Icon library embedded in the visual package (spec 9.6): inline SVG only, no external resource.
 * Every icon is drawn in a 16 x 16 box and inherits the text color (currentColor).
 */
import { IconName } from "./settingsSchema";
import { svgEl } from "./utils";

type Shape =
    | { tag: "path"; d: string; stroke?: boolean }
    | { tag: "circle"; cx: number; cy: number; r: number }
    | { tag: "rect"; x: number; y: number; width: number; height: number; rx?: number };

const SHAPES: Record<Exclude<IconName, "none">, Shape[]> = {
    diamond: [{ tag: "path", d: "M8 1.2 14.8 8 8 14.8 1.2 8Z" }],
    circle: [{ tag: "circle", cx: 8, cy: 8, r: 6 }],
    square: [{ tag: "rect", x: 2.5, y: 2.5, width: 11, height: 11, rx: 1.5 }],
    check: [{ tag: "path", d: "M2.5 8.6 6.4 12.3 13.5 4.2", stroke: true }],
    arrowUp: [{ tag: "path", d: "M8 13.5V3M3.5 7.2 8 2.7l4.5 4.5", stroke: true }],
    arrowDown: [{ tag: "path", d: "M8 2.5V13M3.5 8.8 8 13.3l4.5-4.5", stroke: true }],
    warning: [
        { tag: "path", d: "M8 1.3 15.3 14.2H0.7Z" },
        { tag: "path", d: "M8 6v4.1M8 11.9v0.3", stroke: true }
    ]
};

export const ICON_NAMES = Object.keys(SHAPES) as Array<Exclude<IconName, "none">>;

/** Creates an icon. Returns null for "none". */
export function createIcon(name: IconName, sizePx: number, className = "kpt-icon"): SVGSVGElement | null {
    if (name === "none" || !SHAPES[name]) {
        return null;
    }
    const svg = svgEl("svg", {
        viewBox: "0 0 16 16",
        width: sizePx,
        height: sizePx,
        "aria-hidden": "true",
        focusable: "false"
    });
    svg.setAttribute("class", className);
    const shapes = SHAPES[name];
    shapes.forEach((shape, index) => {
        if (shape.tag === "path") {
            const path = svgEl("path", { d: shape.d });
            if (shape.stroke) {
                path.setAttribute("fill", "none");
                // The exclamation mark of the warning icon is knocked out of the triangle.
                path.setAttribute("stroke", name === "warning" && index > 0 ? "var(--kpt-icon-knockout, #FFFFFF)" : "currentColor");
                path.setAttribute("stroke-width", name === "warning" ? "1.6" : "2");
                path.setAttribute("stroke-linecap", "round");
                path.setAttribute("stroke-linejoin", "round");
            } else {
                path.setAttribute("fill", "currentColor");
            }
            svg.appendChild(path);
        } else if (shape.tag === "circle") {
            svg.appendChild(svgEl("circle", { cx: shape.cx, cy: shape.cy, r: shape.r, fill: "currentColor" }));
        } else {
            svg.appendChild(svgEl("rect", { x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: shape.rx ?? 0, fill: "currentColor" }));
        }
    });
    return svg;
}
