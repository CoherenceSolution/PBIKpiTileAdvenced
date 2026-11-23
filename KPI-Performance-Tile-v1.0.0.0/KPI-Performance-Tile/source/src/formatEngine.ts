/**
 * Format engine backed by the official Power BI valueFormatter, so that format strings
 * inherited from measures are rendered exactly as in native visuals.
 */
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

import { FormatEngine } from "./numberFormat";

export const powerBiEngine: FormatEngine = (value, format, locale) =>
    valueFormatter.format(value, format, false, locale);
