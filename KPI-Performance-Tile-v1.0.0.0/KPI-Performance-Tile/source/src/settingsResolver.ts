/**
 * Reads the persisted formatting values (dataView.metadata.objects) into a plain, typed,
 * sanitised settings object. Pure: no Power BI runtime dependency.
 */
import { Align, CardName, FontValue, PropDef, SCHEMA, TileSettings, fontPropertyNames } from "./settingsSchema";

type RawObjects = Record<string, Record<string, unknown> | undefined> | undefined | null;

const ALIGN_VALUES: ReadonlyArray<Align> = ["left", "center", "right"];

function readColor(raw: unknown, fallback: string): string {
    if (typeof raw === "string" && raw.length > 0) {
        return raw;
    }
    if (raw && typeof raw === "object") {
        const solid = (raw as { solid?: { color?: unknown } }).solid;
        if (solid && typeof solid.color === "string" && solid.color.length > 0) {
            return solid.color;
        }
        const value = (raw as { value?: unknown }).value;
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    return fallback;
}

function readNumber(raw: unknown, fallback: number, min?: number, max?: number): number {
    let value = typeof raw === "number" ? raw : (typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN);
    if (!Number.isFinite(value)) {
        return fallback;
    }
    if (min !== undefined && value < min) {
        value = min;
    }
    if (max !== undefined && value > max) {
        value = max;
    }
    return value;
}

function readBool(raw: unknown, fallback: boolean): boolean {
    return typeof raw === "boolean" ? raw : fallback;
}

function readProp(def: PropDef, key: string, card: Record<string, unknown> | undefined): unknown {
    const raw = card ? card[key] : undefined;
    switch (def.kind) {
        case "toggle":
            return readBool(raw, def.default);
        case "color":
            return readColor(raw, def.default);
        case "number":
            return readNumber(raw, def.default, def.min, def.max);
        case "text":
            return typeof raw === "string" ? raw : def.default;
        case "dropdown": {
            const candidate = raw && typeof raw === "object" ? (raw as { value?: unknown }).value : raw;
            return def.items.some(item => item.value === candidate) ? candidate : def.default;
        }
        case "align":
            return ALIGN_VALUES.includes(raw as Align) ? raw : def.default;
        case "font": {
            const names = fontPropertyNames(key);
            const d = def.default;
            const font: FontValue = {
                family: typeof card?.[names.family] === "string" && card[names.family] !== "" ? String(card[names.family]) : d.family,
                size: readNumber(card?.[names.size], d.size, 6, 72),
                bold: readBool(card?.[names.bold], d.bold),
                italic: readBool(card?.[names.italic], d.italic),
                underline: readBool(card?.[names.underline], d.underline)
            };
            return font;
        }
    }
}

export function resolveSettings(objects?: RawObjects): TileSettings {
    const result: Record<string, Record<string, unknown>> = {};
    for (const cardName of Object.keys(SCHEMA) as CardName[]) {
        const props = SCHEMA[cardName].props as Record<string, PropDef>;
        const rawCard = objects ? objects[cardName] : undefined;
        const card: Record<string, unknown> = {};
        for (const key of Object.keys(props)) {
            card[key] = readProp(props[key], key, rawCard);
        }
        result[cardName] = card;
    }
    return result as unknown as TileSettings;
}

export function defaultSettings(): TileSettings {
    return resolveSettings(undefined);
}
