/**
 * Header of the tile: technical name, category, title and optional subtitle (spec 5 and 6).
 */
import { RenderContext } from "./renderContext";
import { applyFont, clampLines, el } from "./utils";

export interface HeaderElements {
    root: HTMLElement;
    topRow: HTMLElement | null;
    technicalName: HTMLElement | null;
    category: HTMLElement | null;
    title: HTMLElement | null;
    subtitle: HTMLElement | null;
}

const MIN_TEXT_PX = 9;

export function renderHeader(ctx: RenderContext): HeaderElements {
    const { settings, view, plan, theme } = ctx;
    const h = settings.header;
    const root = el("div", "kpt-header");
    const result: HeaderElements = { root, topRow: null, technicalName: null, category: null, title: null, subtitle: null };

    const showCategory = plan.show.category && !!view.category;
    if (view.technicalName || showCategory) {
        const row = el("div", "kpt-header-top");
        result.topRow = row;

        if (view.technicalName) {
            const tech = el("span", "kpt-tech", view.technicalName);
            const boxed = h.technicalNameBackgroundShow || h.technicalNameBorderShow;
            const background = h.technicalNameBackgroundShow ? theme.surface(h.technicalNameBackgroundColor) : undefined;
            applyFont(tech, h.technicalNameFont, theme.text(h.technicalNameColor, background), plan.textScale, MIN_TEXT_PX);
            if (boxed) {
                tech.classList.add("kpt-boxed");
                if (background) {
                    tech.style.backgroundColor = background;
                }
                if (h.technicalNameBorderShow || theme.highContrast) {
                    tech.style.borderColor = theme.line(h.technicalNameBorderColor);
                }
            }
            tech.title = view.technicalName;
            row.appendChild(tech);
            result.technicalName = tech;
        }

        if (showCategory && view.category) {
            const category = el("span", "kpt-category", view.category);
            const background = h.categoryBadge ? theme.surface(h.categoryBadgeColor) : undefined;
            applyFont(category, h.categoryFont, theme.text(h.categoryColor, background), plan.textScale, MIN_TEXT_PX);
            if (h.categoryBadge) {
                category.classList.add("kpt-pill");
                category.style.backgroundColor = background as string;
                if (theme.highContrast) {
                    category.style.border = `1px solid ${theme.foreground}`;
                }
            }
            category.title = view.category;
            row.appendChild(category);
            result.category = category;
        }
        root.appendChild(row);
    }

    if (view.title) {
        const title = el("div", "kpt-title", view.title);
        applyFont(title, h.titleFont, theme.text(h.titleColor), plan.textScale, 10);
        title.style.textAlign = h.titleAlign;
        clampLines(title, plan.mode === "minimal" ? Math.min(2, h.titleMaxLines) : h.titleMaxLines);
        // Full text available when the title is truncated (spec 6.1).
        title.title = view.title;
        title.setAttribute("role", "heading");
        title.setAttribute("aria-level", "2");
        root.appendChild(title);
        result.title = title;
    }

    if (plan.show.subtitle && view.subtitle) {
        const subtitle = el("div", "kpt-subtitle", view.subtitle);
        applyFont(subtitle, h.subtitleFont, theme.text(h.subtitleColor), plan.textScale, MIN_TEXT_PX);
        subtitle.style.textAlign = h.subtitleAlign;
        clampLines(subtitle, h.subtitleMaxLines);
        subtitle.title = view.subtitle;
        root.appendChild(subtitle);
        result.subtitle = subtitle;
    }

    return result;
}
