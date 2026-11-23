/**
 * Number formatting of the tile: display units, decimals, separators, prefix / suffix,
 * on top of the format string inherited from the Power BI measure.
 *
 * The rendering of a .NET-style format string is delegated to a "format engine":
 *  - in Power BI the engine is the official valueFormatter (see formatEngine.ts);
 *  - a small Intl-based engine is used as a safety net and in unit tests.
 * Pure module.
 */
import { DisplayUnits } from "./settingsSchema";

export type FormatEngine = (value: number | Date, format: string | undefined, locale?: string) => string;

export interface NumberFormatOptions {
    /** Format string of the measure (dataView metadata). */
    format?: string;
    mode: "inherit" | "number" | "percent";
    displayUnits: DisplayUnits;
    /** null = automatic. */
    decimals: number | null;
    thousandsSeparator: boolean;
    prefix?: string;
    suffix?: string;
    locale?: string;
}

const UNITS: Record<Exclude<DisplayUnits, "auto" | "none">, { divisor: number; symbol: string }> = {
    thousands: { divisor: 1e3, symbol: "K" },
    millions: { divisor: 1e6, symbol: "M" },
    billions: { divisor: 1e9, symbol: "bn" }
};

// ------------------------------------------------------------------ format-string helpers

interface NumericToken { start: number; end: number; integer: string; decimals: string }

/** Finds the numeric placeholder (e.g. "#,0.00") of one section of a format string, ignoring literals. */
function findNumericToken(section: string): NumericToken | null {
    let i = 0;
    while (i < section.length) {
        const char = section[i];
        if (char === "\\") {
            i += 2;
            continue;
        }
        if (char === "\"" || char === "'") {
            const close = section.indexOf(char, i + 1);
            i = close === -1 ? section.length : close + 1;
            continue;
        }
        const startsDecimal = char === "." && (section[i + 1] === "0" || section[i + 1] === "#");
        if (char === "0" || char === "#" || startsDecimal) {
            let j = i;
            let seenDot = false;
            while (j < section.length) {
                const c = section[j];
                if (c === "0" || c === "#" || c === ",") {
                    j++;
                } else if (c === "." && !seenDot && (section[j + 1] === "0" || section[j + 1] === "#")) {
                    seenDot = true;
                    j++;
                } else {
                    break;
                }
            }
            const token = section.slice(i, j);
            const dot = token.indexOf(".");
            return {
                start: i,
                end: j,
                integer: dot === -1 ? token : token.slice(0, dot),
                decimals: dot === -1 ? "" : token.slice(dot + 1)
            };
        }
        i++;
    }
    return null;
}

function splitSections(format: string): string[] {
    const sections: string[] = [];
    let current = "";
    let quote: string | null = null;
    for (let i = 0; i < format.length; i++) {
        const char = format[i];
        if (quote) {
            current += char;
            if (char === quote) {
                quote = null;
            }
        } else if (char === "\\") {
            current += char + (format[i + 1] ?? "");
            i++;
        } else if (char === "\"" || char === "'") {
            quote = char;
            current += char;
        } else if (char === ";") {
            sections.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    sections.push(current);
    return sections;
}

function mapSections(format: string, transform: (token: NumericToken) => string): string {
    return splitSections(format).map(section => {
        const token = findNumericToken(section);
        return token ? section.slice(0, token.start) + transform(token) + section.slice(token.end) : section;
    }).join(";");
}

/** True when the format string renders a percentage. */
export function isPercentFormat(format: string | undefined): boolean {
    if (!format) {
        return false;
    }
    if (/^[pP]\d*$/.test(format)) {
        return true;
    }
    let quote: string | null = null;
    for (let i = 0; i < format.length; i++) {
        const char = format[i];
        if (quote) {
            if (char === quote) {
                quote = null;
            }
        } else if (char === "\\") {
            i++;
        } else if (char === "\"" || char === "'") {
            quote = char;
        } else if (char === "%") {
            return true;
        }
    }
    return false;
}

/** Sets the number of decimals of a format string ("#,0" + 1 -> "#,0.0"). */
export function withDecimals(format: string, decimals: number, optional = false): string {
    const placeholder = optional ? "#" : "0";
    return mapSections(format, token =>
        (token.integer === "" ? "0" : token.integer) + (decimals > 0 ? "." + placeholder.repeat(decimals) : ""));
}

/** Removes the thousands separator of a format string ("#,0.0" -> "0.0"). */
export function withoutGrouping(format: string): string {
    return mapSections(format, token => {
        const integer = token.integer.replace(/,/g, "").replace(/#+(?=0)/, "") || "0";
        return integer + (token.decimals ? "." + token.decimals : "");
    });
}

/** Translates standard .NET numeric formats (N2, P1, F0, G) to custom format strings. */
export function normaliseFormat(format: string | undefined, value: number): string {
    const general = Number.isInteger(value) ? "#,0" : "#,0.##";
    if (!format || /^(g|general|general number)$/i.test(format.trim())) {
        return general;
    }
    const named = /^([nNpPfFdD])(\d*)$/.exec(format.trim());
    if (named) {
        const digits = named[2] === "" ? 2 : Number(named[2]);
        const decimals = digits > 0 ? "." + "0".repeat(digits) : "";
        switch (named[1].toLowerCase()) {
            case "n": return "#,0" + decimals;
            case "p": return "#,0" + decimals + "%";
            case "f": return "0" + decimals;
            case "d": return "0";
        }
    }
    return format;
}

// ------------------------------------------------------------------ engines

/** Minimal Intl-based engine: handles the usual "#,0.00", "0.0%", prefix / suffix literals. */
export const basicEngine: FormatEngine = (value, format, locale) => {
    if (value instanceof Date) {
        try {
            return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(value);
        } catch {
            return value.toISOString().slice(0, 10);
        }
    }
    const sections = splitSections(format && format !== "" ? format : "#,0.##");
    let section = sections[0];
    let magnitude = value;
    if (value < 0 && sections.length > 1 && sections[1] !== "") {
        section = sections[1];
        magnitude = -value;
    } else if (value === 0 && sections.length > 2 && sections[2] !== "") {
        section = sections[2];
    }
    const token = findNumericToken(section);
    if (!token) {
        return String(value);
    }
    const percent = isPercentFormat(section);
    const minimumFractionDigits = (token.decimals.match(/0/g) ?? []).length;
    const maximumFractionDigits = token.decimals.length;
    let text: string;
    try {
        text = new Intl.NumberFormat(locale, {
            useGrouping: token.integer.includes(","),
            minimumFractionDigits,
            maximumFractionDigits,
            minimumIntegerDigits: Math.max(1, Math.min(21, (token.integer.match(/0/g) ?? []).length))
        }).format(percent ? magnitude * 100 : magnitude);
    } catch {
        text = (percent ? magnitude * 100 : magnitude).toFixed(maximumFractionDigits);
    }
    const literal = (part: string) => part.replace(/\\(.)/g, "$1").replace(/["']/g, "");
    return literal(section.slice(0, token.start)) + text + literal(section.slice(token.end));
};

let engine: FormatEngine = basicEngine;

/** Installs the format engine (the Power BI valueFormatter in production). */
export function setFormatEngine(next: FormatEngine): void {
    engine = (value, format, locale) => {
        try {
            const text = next(value, format, locale);
            if (typeof text === "string" && text !== "") {
                return text;
            }
        } catch {
            // fall through to the basic engine
        }
        return basicEngine(value, format, locale);
    };
}

/** Formats any raw value (tooltip fields, dates) with its format string. */
export function formatRawValue(value: unknown, format?: string, locale?: string): string {
    if (value === null || value === undefined || value === "") {
        return "(Blank)";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? engine(value, normaliseFormat(format, value), locale) : String(value);
    }
    if (value instanceof Date) {
        return engine(value, format, locale);
    }
    return String(value);
}

// ------------------------------------------------------------------ main entry point

/** Display unit applied by the "auto" setting: units start at 10,000 so that 975 and 1,000 stay readable. */
export function autoDisplayUnit(value: number): Exclude<DisplayUnits, "auto"> {
    const magnitude = Math.abs(value);
    if (magnitude >= 1e9) {
        return "billions";
    }
    if (magnitude >= 1e6) {
        return "millions";
    }
    return magnitude >= 1e4 ? "thousands" : "none";
}

function insertUnit(text: string, symbol: string): string {
    let lastDigit = -1;
    for (let i = text.length - 1; i >= 0; i--) {
        if (text[i] >= "0" && text[i] <= "9") {
            lastDigit = i;
            break;
        }
    }
    return lastDigit === -1 ? text + symbol : text.slice(0, lastDigit + 1) + symbol + text.slice(lastDigit + 1);
}

export function formatNumber(value: number | null | undefined, options: NumberFormatOptions): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "";
    }
    let format: string;
    if (options.mode === "percent") {
        format = "#,0.0%";
    } else if (options.mode === "number") {
        format = Number.isInteger(value) ? "#,0" : "#,0.##";
    } else {
        format = normaliseFormat(options.format, value);
    }
    const percent = isPercentFormat(format);

    let unit: Exclude<DisplayUnits, "auto"> = "none";
    if (!percent) {
        unit = options.displayUnits === "auto" ? autoDisplayUnit(value) : options.displayUnits;
    }
    const scaled = unit === "none" ? value : value / UNITS[unit].divisor;

    if (options.decimals !== null) {
        format = withDecimals(format, Math.max(0, Math.round(options.decimals)));
    } else if (unit !== "none") {
        format = withDecimals(format, 1, true); // 12.4K, 12K
    }
    if (!options.thousandsSeparator) {
        format = withoutGrouping(format);
    }

    let text = engine(scaled, format, options.locale);
    if (unit !== "none") {
        text = insertUnit(text, UNITS[unit].symbol);
    }
    return (options.prefix ?? "") + text + (options.suffix ?? "");
}
