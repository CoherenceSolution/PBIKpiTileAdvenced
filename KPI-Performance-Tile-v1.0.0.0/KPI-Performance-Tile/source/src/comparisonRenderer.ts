/**
 * The two generic comparisons (spec 10): value + label, colored by sign and performance direction.
 */
import { createIcon } from "./icons";
import { RenderContext } from "./renderContext";
import { applyFont, el } from "./utils";
import { ComparisonView } from "./viewModel";

export function renderComparison(comparison: ComparisonView, ctx: RenderContext): HTMLElement | null {
    if (!comparison.visible) {
        return null;
    }
    const { plan, theme } = ctx;
    const s = comparison.settings;
    const node = el("div", `kpt-cmp kpt-cmp-${comparison.tone}`);
    const labelColor = theme.text(s.labelColor);
    const fontPx = applyFont(node, s.font, labelColor, plan.textScale, 9);

    const toneColor = comparison.tone === "positive" ? s.positiveColor : comparison.tone === "negative" ? s.negativeColor : s.neutralColor;
    const value = el("span", "kpt-cmp-value");
    value.style.color = theme.text(toneColor);
    value.style.fontWeight = s.valueBold ? "700" : "inherit";
    if (comparison.arrow) {
        // The arrow doubles the sign: the direction is never conveyed by color alone.
        const arrow = createIcon(comparison.arrow === "up" ? "arrowUp" : "arrowDown", Math.round(fontPx * 0.85), "kpt-icon kpt-cmp-arrow");
        if (arrow) {
            value.appendChild(arrow);
        }
    }
    value.appendChild(document.createTextNode(comparison.valueText));

    const label = comparison.label ? el("span", "kpt-cmp-label", comparison.label) : null;
    if (label && s.labelPlacement === "before") {
        node.appendChild(label);
        node.appendChild(document.createTextNode(" "));
        node.appendChild(value);
    } else {
        node.appendChild(value);
        if (label) {
            node.appendChild(document.createTextNode(" "));
            node.appendChild(label);
        }
    }
    const text = s.labelPlacement === "before" ? `${comparison.label} ${comparison.valueText}` : `${comparison.valueText} ${comparison.label}`;
    node.title = text.trim();
    return node;
}
