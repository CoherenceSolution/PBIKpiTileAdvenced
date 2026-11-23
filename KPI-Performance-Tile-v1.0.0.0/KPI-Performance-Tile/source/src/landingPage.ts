/**
 * Landing page displayed while no field is assigned to the visual (spec 24).
 */
import { Theme } from "./accessibilityManager";
import { el, svgEl } from "./utils";

const SECTIONS: ReadonlyArray<{ title: string; items: string[]; minHeight: number }> = [
    { title: "Required", items: ["Period", "Primary Value"], minHeight: 0 },
    { title: "Recommended", items: ["Actual Value", "Previous Year Value", "Is Current Period"], minHeight: 190 },
    {
        title: "Optional",
        items: [
            "Secondary Value (+ Label)",
            "Target Value",
            "Projected Value / Projection Remaining",
            "Comparison 1 and 2 (Value + Label)",
            "Status Code or Status Value (+ Status Label)",
            "KPI Technical Name, Title, Subtitle, Category",
            "Period Sort Key, Action URL, Tooltip Fields"
        ],
        minHeight: 330
    }
];

function logo(color: string, soft: string): SVGSVGElement {
    const svg = svgEl("svg", { viewBox: "0 0 20 20", width: 28, height: 28, "aria-hidden": "true", focusable: "false" });
    svg.appendChild(svgEl("rect", { x: 1, y: 11, width: 3, height: 7, rx: 0.5, fill: soft }));
    svg.appendChild(svgEl("rect", { x: 4.5, y: 8, width: 3, height: 10, rx: 0.5, fill: color }));
    svg.appendChild(svgEl("rect", { x: 9.5, y: 9, width: 3, height: 9, rx: 0.5, fill: soft }));
    svg.appendChild(svgEl("rect", { x: 13, y: 10, width: 3, height: 8, rx: 0.5, fill: color }));
    svg.appendChild(svgEl("rect", { x: 13.4, y: 4.4, width: 2.2, height: 5.6, fill: "none", stroke: color, "stroke-width": 0.8, "stroke-dasharray": "1.4 1" }));
    return svg;
}

export function renderLanding(root: HTMLElement, theme: Theme, width: number, height: number): void {
    const text = theme.highContrast ? theme.foreground : "#1F2523";
    const muted = theme.highContrast ? theme.foreground : "#5F6B66";
    const accent = theme.highContrast ? theme.foreground : "#1F5F4A";
    const soft = theme.highContrast ? theme.foreground : "#A9BDB2";

    const landing = el("div", "kpt-landing");
    landing.setAttribute("role", "note");
    landing.style.color = text;

    const head = el("div", "kpt-landing-head");
    head.appendChild(logo(accent, soft));
    const title = el("div", "kpt-landing-title", "KPI Performance Tile");
    head.appendChild(title);
    landing.appendChild(head);

    if (height >= 120) {
        const intro = el("div", "kpt-landing-intro", "One KPI per tile. Add fields to get started.");
        intro.style.color = muted;
        landing.appendChild(intro);
    }

    const columns = el("div", "kpt-landing-sections");
    for (const section of SECTIONS) {
        if (height < section.minHeight || (width < 220 && section.title === "Optional")) {
            continue;
        }
        const block = el("div", "kpt-landing-section");
        const heading = el("div", "kpt-landing-heading", `${section.title}:`);
        block.appendChild(heading);
        const list = el("ul", "kpt-landing-list");
        for (const item of section.items) {
            const li = el("li", undefined, item);
            li.style.color = section.title === "Optional" ? muted : text;
            list.appendChild(li);
        }
        block.appendChild(list);
        columns.appendChild(block);
    }
    landing.appendChild(columns);
    root.appendChild(landing);
}
