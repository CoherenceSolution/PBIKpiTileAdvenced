/**
 * Status badge (spec 9). Conditional coloring is applied to the badge only: icon, text,
 * background and optional border. The state is always carried by an icon and a text as well,
 * never by color alone.
 */
import { createIcon } from "./icons";
import { RenderContext } from "./renderContext";
import { IconName } from "./settingsSchema";
import { applyFont, el } from "./utils";

export function renderStatusBadge(ctx: RenderContext): HTMLElement | null {
    const { settings, view, plan, theme } = ctx;
    const status = view.status;
    if (!status.visible || !status.label) {
        return null;
    }
    const s = settings.statusBadge;
    const values = s as unknown as Record<string, string>;
    const state = status.state;
    const background = theme.surface(values[`${state}BackgroundColor`]);
    const textColor = theme.text(values[`${state}TextColor`], theme.highContrast ? undefined : background);
    const borderColor = theme.line(values[`${state}BorderColor`]);
    const icon = values[`${state}Icon`] as IconName;

    const badge = el("span", `kpt-badge kpt-badge-${state}`);
    const fontPx = applyFont(badge, s.badgeFont, textColor, plan.textScale, 9);
    badge.style.backgroundColor = background;
    badge.style.borderRadius = `${s.badgeRadius}px`;
    badge.style.padding = `${s.badgePaddingV}px ${s.badgePaddingH}px`;
    badge.style.borderColor = s.badgeBorderShow || theme.highContrast ? borderColor : "transparent";
    badge.style.setProperty("--kpt-icon-knockout", background);

    const svg = createIcon(icon, Math.round(fontPx * 0.95));
    if (svg) {
        badge.appendChild(svg);
    }
    badge.appendChild(el("span", "kpt-badge-text", status.label));
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-label", `Status: ${status.label}`);
    badge.title = status.label;
    return badge;
}
