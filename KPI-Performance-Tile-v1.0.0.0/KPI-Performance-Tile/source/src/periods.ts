/**
 * Period parsing, granularity detection and compact labels (month / quarter / year).
 * Pure module.
 */

export type Granularity = "month" | "quarter" | "year" | "day" | "unknown";
export type GranularitySetting = "auto" | "month" | "quarter" | "year";
export type LabelStyle = "full" | "short" | "tiny";

export interface ParsedPeriod {
    /** Sortable timestamp (ms) of the start of the period. */
    time: number;
    year: number;
    /** 1-12 when known. */
    month: number | null;
    /** 1-4 when known. */
    quarter: number | null;
    /** What the raw value itself tells about the granularity. "day" = a full date. */
    hint: Granularity;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month names and abbreviations (EN / FR / NL), accents and dots removed. */
const MONTH_LOOKUP: Record<string, number> = {
    jan: 1, janv: 1, january: 1, janvier: 1, januari: 1,
    feb: 2, fev: 2, febr: 2, fevr: 2, february: 2, fevrier: 2, februari: 2,
    mar: 3, mrt: 3, maa: 3, march: 3, mars: 3, maart: 3,
    apr: 4, avr: 4, april: 4, avril: 4,
    may: 5, mai: 5, mei: 5,
    jun: 6, juin: 6, june: 6, juni: 6,
    jul: 7, juil: 7, july: 7, juillet: 7, juli: 7,
    aug: 8, aou: 8, aout: 8, august: 8, augustus: 8,
    sep: 9, sept: 9, september: 9, septembre: 9,
    oct: 10, okt: 10, october: 10, octobre: 10, oktober: 10,
    nov: 11, november: 11, novembre: 11,
    dec: 12, december: 12, decembre: 12
};

function normaliseYear(text: string): number | null {
    const value = Number(text);
    if (!Number.isInteger(value)) {
        return null;
    }
    if (text.length === 2) {
        return 2000 + value;
    }
    return value >= 1900 && value <= 2200 ? value : null;
}

function monthFromName(name: string): number | null {
    const key = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "");
    if (MONTH_LOOKUP[key] !== undefined) {
        return MONTH_LOOKUP[key];
    }
    for (const length of [4, 3]) {
        const prefix = key.slice(0, length);
        if (key.length >= length && MONTH_LOOKUP[prefix] !== undefined) {
            return MONTH_LOOKUP[prefix];
        }
    }
    return null;
}

function make(year: number, month: number | null, quarter: number | null, hint: Granularity, day = 1): ParsedPeriod {
    const monthIndex = month !== null ? month - 1 : (quarter !== null ? (quarter - 1) * 3 : 0);
    return {
        time: new Date(year, monthIndex, day).getTime(),
        year,
        month: month ?? null,
        quarter: quarter ?? (month !== null ? Math.ceil(month / 3) : null),
        hint
    };
}

function fromDate(date: Date): ParsedPeriod | null {
    const time = date.getTime();
    if (Number.isNaN(time)) {
        return null;
    }
    const month = date.getMonth() + 1;
    return { time, year: date.getFullYear(), month, quarter: Math.ceil(month / 3), hint: "day" };
}

function fromNumber(value: number): ParsedPeriod | null {
    if (!Number.isInteger(value) || value <= 0) {
        return null;
    }
    const text = String(value);
    if (text.length === 4) {
        const year = normaliseYear(text);
        return year === null ? null : make(year, null, null, "year");
    }
    if (text.length === 6) {
        const year = normaliseYear(text.slice(0, 4));
        const month = Number(text.slice(4));
        return year !== null && month >= 1 && month <= 12 ? make(year, month, null, "month") : null;
    }
    if (text.length === 5) {
        const year = normaliseYear(text.slice(0, 4));
        const quarter = Number(text.slice(4));
        return year !== null && quarter >= 1 && quarter <= 4 ? make(year, null, quarter, "quarter") : null;
    }
    if (text.length === 8) {
        const year = normaliseYear(text.slice(0, 4));
        const month = Number(text.slice(4, 6));
        const day = Number(text.slice(6));
        return year !== null && month >= 1 && month <= 12 && day >= 1 && day <= 31 ? make(year, month, null, "day", day) : null;
    }
    return null;
}

const SEP = "[\\s\\-\\/_.,']*";
const YEAR = "(\\d{4}|\\d{2})";

const RE_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;
const RE_YEAR = /^(?:FY|CY|AN|JAAR)?\s*'?(\d{4})$/i;
const RE_FISCAL_SHORT = /^(?:FY|CY)\s*'?(\d{2})$/i;
const RE_QUARTER_FIRST = new RegExp(`^[QTK]([1-4])${SEP}${YEAR}$`, "i");
const RE_QUARTER_LAST = new RegExp(`^${YEAR}${SEP}[QTK]([1-4])$`, "i");
const RE_MONTH_NUM_YEAR_FIRST = /^(\d{4})[-/.\s](\d{1,2})$/;
const RE_MONTH_NUM_YEAR_LAST = /^(\d{1,2})[-/.\s](\d{4})$/;
const RE_MONTH_NAME_FIRST = new RegExp(`^([^\\d\\s\\-\\/_,']+)${SEP}${YEAR}$`);
const RE_MONTH_NAME_LAST = new RegExp(`^${YEAR}${SEP}([^\\d\\s\\-\\/_,']+)$`);

function fromString(raw: string): ParsedPeriod | null {
    const text = raw.trim();
    if (text === "") {
        return null;
    }
    let match = RE_ISO_DATE.exec(text);
    if (match) {
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return fromDate(date);
    }
    match = RE_YEAR.exec(text);
    if (match) {
        const year = normaliseYear(match[1]);
        return year === null ? null : make(year, null, null, "year");
    }
    match = RE_FISCAL_SHORT.exec(text);
    if (match) {
        return make(2000 + Number(match[1]), null, null, "year");
    }
    match = RE_QUARTER_FIRST.exec(text);
    if (match) {
        const year = normaliseYear(match[2]);
        return year === null ? null : make(year, null, Number(match[1]), "quarter");
    }
    match = RE_QUARTER_LAST.exec(text);
    if (match) {
        const year = normaliseYear(match[1]);
        return year === null ? null : make(year, null, Number(match[2]), "quarter");
    }
    match = RE_MONTH_NUM_YEAR_FIRST.exec(text);
    if (match) {
        const year = normaliseYear(match[1]);
        const month = Number(match[2]);
        return year !== null && month >= 1 && month <= 12 ? make(year, month, null, "month") : null;
    }
    match = RE_MONTH_NUM_YEAR_LAST.exec(text);
    if (match) {
        const year = normaliseYear(match[2]);
        const month = Number(match[1]);
        return year !== null && month >= 1 && month <= 12 ? make(year, month, null, "month") : null;
    }
    match = RE_MONTH_NAME_FIRST.exec(text);
    if (match) {
        const month = monthFromName(match[1]);
        const year = normaliseYear(match[2]);
        return month !== null && year !== null ? make(year, month, null, "month") : null;
    }
    match = RE_MONTH_NAME_LAST.exec(text);
    if (match) {
        const month = monthFromName(match[2]);
        const year = normaliseYear(match[1]);
        return month !== null && year !== null ? make(year, month, null, "month") : null;
    }
    return null;
}

/** Parses a period value (Date, number such as 202601, or text such as "Q1 2026"). */
export function parsePeriod(raw: unknown): ParsedPeriod | null {
    if (raw === null || raw === undefined) {
        return null;
    }
    if (raw instanceof Date) {
        return fromDate(raw);
    }
    if (typeof raw === "number") {
        return fromNumber(raw);
    }
    if (typeof raw === "string") {
        return fromString(raw);
    }
    return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deduces the granularity of a series of parsed periods. */
export function detectGranularity(periods: ReadonlyArray<ParsedPeriod | null>): Granularity {
    const known = periods.filter((p): p is ParsedPeriod => p !== null);
    if (known.length === 0 || known.length !== periods.length) {
        return "unknown";
    }
    const hints = new Set(known.map(p => p.hint));
    if (hints.size === 1 && !hints.has("day")) {
        return known[0].hint;
    }
    if (hints.size > 1 && !hints.has("day")) {
        return "unknown";
    }
    // Full dates: look at the smallest gap between two consecutive periods.
    const times = Array.from(new Set(known.map(p => p.time))).sort((a, b) => a - b);
    if (times.length < 2) {
        return "unknown";
    }
    let minGap = Infinity;
    for (let i = 1; i < times.length; i++) {
        minGap = Math.min(minGap, (times[i] - times[i - 1]) / DAY_MS);
    }
    if (minGap < 27) {
        return "day";
    }
    if (minGap <= 32) {
        return "month";
    }
    if (minGap >= 85 && minGap <= 95) {
        return "quarter";
    }
    if (minGap >= 360) {
        return "year";
    }
    return "unknown";
}

export function resolveGranularity(setting: GranularitySetting, periods: ReadonlyArray<ParsedPeriod | null>): Granularity {
    return setting === "auto" ? detectGranularity(periods) : setting;
}

const twoDigits = (year: number): string => `'${String(year % 100).padStart(2, "0")}`;

/**
 * Compact label for a period. Returns null when the period cannot be labelled at this granularity
 * (the caller then falls back to the value as provided).
 */
export function formatPeriodLabel(period: ParsedPeriod | null, granularity: Granularity, style: LabelStyle): string | null {
    if (!period) {
        return null;
    }
    switch (granularity) {
        case "month": {
            if (period.month === null) {
                return null;
            }
            const name = MONTHS_EN[period.month - 1];
            if (style === "full") {
                return `${name} ${twoDigits(period.year)}`;
            }
            return style === "short" ? name : name.charAt(0);
        }
        case "quarter": {
            if (period.quarter === null) {
                return null;
            }
            return style === "full" ? `Q${period.quarter} ${twoDigits(period.year)}` : `Q${period.quarter}`;
        }
        case "year":
            return style === "full" ? String(period.year) : twoDigits(period.year);
        default:
            return null;
    }
}

/** "12 months", "4 quarters", "1 year", "5 periods". */
export function periodCountCaption(count: number, granularity: Granularity): string {
    const unit = granularity === "month" ? "month" : granularity === "quarter" ? "quarter" : granularity === "year" ? "year" : "period";
    return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
