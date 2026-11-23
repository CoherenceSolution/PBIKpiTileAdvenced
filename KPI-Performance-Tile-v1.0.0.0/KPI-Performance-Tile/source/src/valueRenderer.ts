/**
 * Main value, secondary value and target line (spec 7 and 8).
 */
import { RenderContext } from "./renderContext";
import { applyFont, el, ptToPx } from "./utils";

export interface ValueElements {
    root: HTMLElement;
    value: HTMLElement;
    secondary: HTMLElement | null;
    target: HTMLElement | null;
}

export function renderValue(ctx: RenderContext): ValueElements {
    const { settings, view, plan, theme } = ctx;
    const mv = settings.mainValue;
    const root = el("div", "kpt-value-block");

    const value = el("div", "kpt-value", view.primaryText);
    if (view.primaryState === "value") {
        applyFont(value, mv.valueFont, theme.text(mv.valueColor), plan.valueScale, 14);
    } else {
        // "No data" and error states are quieter than a figure, and never blocking.
        applyFont(value, { ...mv.valueFont, bold: false }, theme.text(mv.secondaryColor), plan.valueScale * 0.55, 12);
        value.classList.add("kpt-value-message");
        if (view.primaryState === "error") {
            value.classList.add("kpt-value-error");
        }
    }
    root.appendChild(value);

    let secondary: HTMLElement | null = null;
    if (plan.show.secondary && view.secondaryText) {
        secondary = el("div", "kpt-secondary", view.secondaryText);
        applyFont(secondary, mv.secondaryFont, theme.text(mv.secondaryColor), plan.textScale, 9);
        root.appendChild(secondary);
    }

    let target: HTMLElement | null = null;
    if (plan.show.target && view.targetText) {
        const t = settings.target;
        target = el("div", "kpt-target");
        target.appendChild(el("span", "kpt-target-text", view.targetText));
        if (view.varianceText) {
            target.appendChild(el("span", "kpt-target-variance", ` · ${view.varianceText}`));
        }
        applyFont(target, t.targetFont, theme.text(t.targetColor), plan.textScale, 9);
        target.style.marginTop = `${t.targetSpacing}px`;
        root.appendChild(target);
    }

    return { root, value, secondary, target };
}

/**
 * Shrinks the main value until it fits its container (auto-size). Must be called once the
 * element is attached to the document. Falls back to an ellipsis below 55% of the size.
 */
export function fitMainValue(value: HTMLElement, enabled: boolean): void {
    if (!enabled || value.clientWidth === 0) {
        return;
    }
    const initial = parseFloat(value.style.fontSize) || ptToPx(28);
    const minimum = Math.max(12, initial * 0.55);
    let size = initial;
    let guard = 0;
    while (value.scrollWidth > value.clientWidth + 0.5 && size > minimum && guard < 12) {
        size = Math.max(minimum, Math.floor(size * (value.clientWidth / value.scrollWidth) * 10) / 10 - 0.2);
        value.style.fontSize = `${size}px`;
        guard++;
    }
}
