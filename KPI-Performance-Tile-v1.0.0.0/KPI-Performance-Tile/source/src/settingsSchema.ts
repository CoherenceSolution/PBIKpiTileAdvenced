/**
 * Declarative description of every formatting property — single source of truth.
 *
 *  - formattingSettings.ts builds the Power BI format pane from it;
 *  - settingsResolver.ts reads the persisted values from the dataView with it;
 *  - scripts/generate-capabilities.ts writes the "objects" block of capabilities.json from it.
 *
 * This file is pure data (no Power BI import) so it can be unit-tested and used by build scripts.
 */

export interface FontValue {
    family: string;
    /** Size in points, as in the Power BI format pane. */
    size: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
}

export type Align = "left" | "center" | "right";

interface PropBase {
    displayName: string;
    description?: string;
    /** Group (sub-section) of the card the property belongs to. */
    group?: string;
    /** When true the toggle is rendered as the on/off switch of its card or group. */
    top?: boolean;
}

export interface ToggleDef extends PropBase { kind: "toggle"; default: boolean }
export interface ColorDef extends PropBase { kind: "color"; default: string }
export interface NumberDef extends PropBase { kind: "number"; default: number; min?: number; max?: number; unit?: string }
export interface TextDef extends PropBase { kind: "text"; default: string; placeholder?: string }
export interface DropdownDef<T extends string = string> extends PropBase {
    kind: "dropdown";
    default: T;
    items: ReadonlyArray<{ value: T; displayName: string }>;
}
export interface FontDef extends PropBase { kind: "font"; default: FontValue }
export interface AlignDef extends PropBase { kind: "align"; default: Align }

export type PropDef = ToggleDef | ColorDef | NumberDef | TextDef | DropdownDef | FontDef | AlignDef;

export type ValueOf<D> =
    D extends ToggleDef ? boolean :
    D extends ColorDef ? string :
    D extends NumberDef ? number :
    D extends TextDef ? string :
    D extends DropdownDef<infer T> ? T :
    D extends FontDef ? FontValue :
    D extends AlignDef ? Align :
    never;

export interface CardDef<P extends Record<string, PropDef> = Record<string, PropDef>> {
    displayName: string;
    description?: string;
    props: P;
}

// ---------------------------------------------------------------- helpers

export const DEFAULT_FONT_FAMILY = "\"Segoe UI\", wf_segoe-ui_normal, helvetica, arial, sans-serif";

const toggle = (displayName: string, def: boolean, extra: Partial<PropBase> = {}): ToggleDef =>
    ({ kind: "toggle", displayName, default: def, ...extra });
const topToggle = (displayName: string, def: boolean): ToggleDef =>
    ({ kind: "toggle", displayName, default: def, top: true });
const color = (displayName: string, def: string, extra: Partial<PropBase> = {}): ColorDef =>
    ({ kind: "color", displayName, default: def, ...extra });
const num = (displayName: string, def: number, min?: number, max?: number, extra: Partial<NumberDef> = {}): NumberDef =>
    ({ kind: "number", displayName, default: def, min, max, ...extra });
const text = (displayName: string, def: string, extra: Partial<TextDef> = {}): TextDef =>
    ({ kind: "text", displayName, default: def, placeholder: "", ...extra });
const font = (displayName: string, size: number, bold = false): FontDef =>
    ({ kind: "font", displayName, default: { family: DEFAULT_FONT_FAMILY, size, bold, italic: false, underline: false } });
const align = (displayName: string, def: Align = "left"): AlignDef =>
    ({ kind: "align", displayName, default: def });

function dropdown<const T extends string>(
    displayName: string,
    items: ReadonlyArray<readonly [T, string]>,
    def: NoInfer<T>,
    extra: Partial<PropBase> = {}
): DropdownDef<T> {
    return {
        kind: "dropdown",
        displayName,
        default: def,
        items: items.map(([value, label]) => ({ value, displayName: label })),
        ...extra
    };
}

function group<P extends Record<string, PropDef>>(name: string, props: P): P {
    for (const key of Object.keys(props)) {
        props[key].group = name;
    }
    return props;
}

function card<P extends Record<string, PropDef>>(displayName: string, props: P, description?: string): CardDef<P> {
    return { displayName, description, props };
}

// ---------------------------------------------------------------- enumerations

export const ICONS = [
    ["diamond", "Diamond"],
    ["circle", "Circle"],
    ["square", "Square"],
    ["check", "Check"],
    ["arrowUp", "Arrow up"],
    ["arrowDown", "Arrow down"],
    ["warning", "Warning"],
    ["none", "No icon"]
] as const;
export type IconName = (typeof ICONS)[number][0];

export const STATUS_STATES = ["onTarget", "nearTarget", "belowTarget", "aboveTarget", "noTarget", "noData", "custom"] as const;
export type StatusState = (typeof STATUS_STATES)[number];

const DISPLAY_UNITS = [
    ["auto", "Auto"],
    ["none", "None"],
    ["thousands", "Thousands"],
    ["millions", "Millions"],
    ["billions", "Billions"]
] as const;
export type DisplayUnits = (typeof DISPLAY_UNITS)[number][0];

type StateProps<P extends string> =
    { [K in `${P}Icon`]: DropdownDef<IconName> } &
    { [K in `${P}Text`]: TextDef } &
    { [K in `${P}TextColor`]: ColorDef } &
    { [K in `${P}BackgroundColor`]: ColorDef } &
    { [K in `${P}BorderColor`]: ColorDef };

function stateProps<P extends StatusState>(
    prefix: P,
    groupName: string,
    d: { icon: IconName; text: string; fg: string; bg: string; border: string }
): StateProps<P> {
    const props: Record<string, PropDef> = {
        [`${prefix}Icon`]: dropdown("Icon", ICONS, d.icon),
        [`${prefix}Text`]: text("Text", d.text),
        [`${prefix}TextColor`]: color("Text and icon color", d.fg),
        [`${prefix}BackgroundColor`]: color("Background color", d.bg),
        [`${prefix}BorderColor`]: color("Border color", d.border)
    };
    return group(groupName, props) as StateProps<P>;
}

function comparisonCard(
    displayName: string,
    d: { label: string; position: "inline" | "ownLine"; labelPlacement: "after" | "before"; colorBySign: boolean; fontSize: number; bold: boolean }
) {
    return card(displayName, {
        show: topToggle("Show", true),
        ...group("Label", {
            label: text("Label", d.label, { description: "Used when no Comparison Label field is provided." }),
            labelPlacement: dropdown("Label placement", [["after", "After the value"], ["before", "Before the value"]], d.labelPlacement),
            labelColor: color("Label color", "#5F6B66")
        }),
        ...group("Value", {
            format: dropdown("Display format", [
                ["auto", "Auto (measure format)"],
                ["percent", "Percentage"],
                ["number", "Absolute value"],
                ["text", "Text prepared by the measure"]
            ], "auto"),
            decimals: num("Decimal places", 1, 0, 6, { description: "Used by the Percentage and Absolute value formats." }),
            showSign: toggle("Show + sign", false),
            showArrow: toggle("Show arrow", false),
            valueBold: toggle("Bold value", d.bold)
        }),
        ...group("Layout", {
            position: dropdown("Position", [["inline", "Right of the status badge"], ["ownLine", "On its own line"]], d.position),
            font: font("Font", d.fontSize)
        }),
        ...group("Colors", {
            colorBySign: toggle("Color by sign", d.colorBySign, { description: "Colors the value according to its sign and the performance direction." }),
            reverseLogic: toggle("Reverse logic", false, { description: "Swaps the positive and negative colors for this comparison only." }),
            positiveColor: color("Positive color", "#1F7A4D"),
            negativeColor: color("Negative color", "#B3261E"),
            neutralColor: color("Neutral color", "#3B4541")
        })
    });
}

// ---------------------------------------------------------------- schema

export const SCHEMA = {
    tile: card("Tile", {
        ...group("Layout", {
            layoutMode: dropdown("Responsive mode", [
                ["auto", "Auto (by width)"],
                ["minimal", "Minimal"],
                ["compact", "Compact"],
                ["standard", "Standard"],
                ["large", "Large"]
            ], "auto"),
            padding: num("Padding", 16, 0, 48, { unit: "px" })
        }),
        ...group("Background", {
            backgroundColor: color("Color", "#FFFFFF"),
            backgroundTransparency: num("Transparency", 0, 0, 100, { unit: "%" })
        }),
        ...group("Border", {
            borderShow: toggle("Show border", true),
            borderColor: color("Color", "#E1E5E3"),
            borderWidth: num("Width", 1, 0, 8, { unit: "px" }),
            borderRadius: num("Rounded corners", 10, 0, 40, { unit: "px" }),
            shadow: toggle("Shadow", false)
        }),
        ...group("Data checks", {
            showWarnings: toggle("Show data warnings", true, { description: "Displays a discreet warning icon when the data is inconsistent (duplicate periods, several current periods, ...)." })
        })
    }),

    header: card("Header", {
        ...group("Technical name", {
            technicalNameShow: topToggle("Show", true),
            technicalNameText: text("Text", "", { description: "Static value used when no KPI Technical Name field is provided." }),
            technicalNameFont: font("Font", 10),
            technicalNameColor: color("Color", "#5F6B66"),
            technicalNameBackgroundShow: toggle("Background", false),
            technicalNameBackgroundColor: color("Background color", "#EEF2F0"),
            technicalNameBorderShow: toggle("Border", false),
            technicalNameBorderColor: color("Border color", "#C9D1CD")
        }),
        ...group("Category", {
            categoryShow: topToggle("Show", true),
            categoryText: text("Text", "", { description: "Static value used when no KPI Category field is provided." }),
            categoryFont: font("Font", 10),
            categoryColor: color("Color", "#2F6B57"),
            categoryBadge: toggle("Badge style", false),
            categoryBadgeColor: color("Badge color", "#E6F0EC")
        }),
        ...group("Title", {
            titleShow: topToggle("Show", true),
            titleText: text("Text", "", { description: "Static value used when no KPI Title field is provided. Defaults to the Primary Value measure name." }),
            titleFont: font("Font", 12, true),
            titleColor: color("Color", "#1F2523"),
            titleAlign: align("Alignment"),
            titleMaxLines: num("Maximum lines", 2, 1, 4, { description: "1 disables word wrap. Longer titles are truncated with an ellipsis; the full text is available in the tooltip." })
        }),
        ...group("Subtitle", {
            subtitleShow: topToggle("Show", true),
            subtitleText: text("Text", "", { description: "Static value used when no KPI Subtitle field is provided." }),
            subtitleFont: font("Font", 9),
            subtitleColor: color("Color", "#5F6B66"),
            subtitleAlign: align("Alignment"),
            subtitleMaxLines: num("Maximum lines", 2, 1, 4)
        })
    }),

    mainValue: card("Main value", {
        ...group("Value", {
            valueFont: font("Font", 28, true),
            valueColor: color("Color", "#1F2523"),
            valueAutoSize: toggle("Auto-size", true, { description: "Scales the value with the responsive mode and shrinks it when it does not fit the width." }),
            noDataText: text("No data text", "No data")
        }),
        ...group("Number format", {
            formatMode: dropdown("Format", [
                ["inherit", "Inherit from measure"],
                ["number", "Number"],
                ["percent", "Percentage"]
            ], "inherit"),
            displayUnits: dropdown("Display units", DISPLAY_UNITS, "auto"),
            decimalsAuto: toggle("Auto decimal places", true),
            decimals: num("Decimal places", 1, 0, 6),
            thousandsSeparator: toggle("Thousands separator", true),
            prefix: text("Prefix", ""),
            suffix: text("Suffix", "")
        }),
        ...group("Secondary value", {
            secondaryShow: topToggle("Show", true),
            secondaryLabel: text("Label", "Actual", { description: "Used when no Secondary Value Label field is provided." }),
            secondaryDisplayUnits: dropdown("Display units", DISPLAY_UNITS, "none"),
            secondaryFont: font("Font", 10),
            secondaryColor: color("Color", "#5F6B66")
        })
    }),

    target: card("Target", {
        targetShow: topToggle("Show", true),
        targetLabel: text("Label", "Target"),
        targetDisplayUnits: dropdown("Display units", DISPLAY_UNITS, "none"),
        targetFont: font("Font", 11),
        targetColor: color("Color", "#5F6B66"),
        targetSpacing: num("Spacing above", 2, 0, 24, { unit: "px" }),
        targetVarianceShow: toggle("Show target variance", false),
        targetVarianceFormat: dropdown("Variance format", [
            ["auto", "Auto"],
            ["percent", "Percentage"],
            ["absolute", "Absolute value"]
        ], "auto", { description: "Auto uses the Target Variance measure format, or a percentage when the variance is derived from Primary Value and Target Value." })
    }),

    statusBadge: card("Status badge", {
        badgeShow: topToggle("Show", true),
        ...group("Rules", {
            mode: dropdown("Calculation mode", [
                ["auto", "Auto (Status Code if provided)"],
                ["thresholds", "Thresholds"],
                ["statusCode", "Status Code"]
            ], "auto"),
            direction: dropdown("Performance direction", [
                ["higher", "Higher is better"],
                ["lower", "Lower is better"],
                ["neutral", "Neutral"]
            ], "higher", { description: "Also drives the colors of the two comparisons." }),
            onTargetThreshold: num("On-target threshold", 0, undefined, undefined, { description: "Status Value from which the KPI is on target (0 = no gap). Same scale as Status Value: -0.05 means -5%." }),
            nearThreshold: num("Near-target threshold", -0.05, undefined, undefined, { description: "Limit of the 'Near target' zone. Only the distance to the on-target threshold matters, so the sign adapts to the performance direction." }),
            aboveEnabled: toggle("Use 'Above target' state", false),
            aboveThreshold: num("Above-target threshold", 0.1, undefined, undefined, { description: "Status Value beyond which the KPI is reported as above target." }),
            showNoTarget: toggle("Show 'No target' badge", true, { description: "When off, the badge is hidden if there is neither target nor status." })
        }),
        ...group("Shape", {
            badgeFont: font("Font", 10),
            badgeRadius: num("Rounded corners", 4, 0, 20, { unit: "px" }),
            badgePaddingH: num("Horizontal padding", 8, 0, 24, { unit: "px" }),
            badgePaddingV: num("Vertical padding", 3, 0, 12, { unit: "px" }),
            badgeBorderShow: toggle("Border", false)
        }),
        ...stateProps("onTarget", "On target", { icon: "check", text: "On target", fg: "#1B5E43", bg: "#E3F1EA", border: "#1B5E43" }),
        ...stateProps("nearTarget", "Near target", { icon: "diamond", text: "Near target", fg: "#8A5300", bg: "#FFF3D6", border: "#8A5300" }),
        ...stateProps("belowTarget", "Below target", { icon: "warning", text: "Below target", fg: "#A1261D", bg: "#FCE9E7", border: "#A1261D" }),
        ...stateProps("aboveTarget", "Above target", { icon: "arrowUp", text: "Above target", fg: "#0B4F8A", bg: "#E4EFFA", border: "#0B4F8A" }),
        ...stateProps("noTarget", "No target", { icon: "circle", text: "No target", fg: "#4F5B56", bg: "#EEF1EF", border: "#4F5B56" }),
        ...stateProps("noData", "No data", { icon: "none", text: "No data", fg: "#4F5B56", bg: "#EEF1EF", border: "#4F5B56" }),
        ...stateProps("custom", "Custom / neutral", { icon: "square", text: "Status", fg: "#3B4541", bg: "#EEF1EF", border: "#3B4541" })
    }),

    comparison1: comparisonCard("Comparison 1", {
        label: "vs previous period", position: "inline", labelPlacement: "after", colorBySign: true, fontSize: 10, bold: false
    }),

    comparison2: comparisonCard("Comparison 2", {
        label: "Vs previous year:", position: "ownLine", labelPlacement: "before", colorBySign: false, fontSize: 10, bold: true
    }),

    chart: card("Chart", {
        chartShow: topToggle("Show", true),
        ...group("Periods", {
            periods: num("Periods to display", 12, 1, 36),
            granularity: dropdown("Period granularity", [
                ["auto", "Auto"],
                ["month", "Month"],
                ["quarter", "Quarter"],
                ["year", "Year"]
            ], "auto"),
            sort: dropdown("Sort", [
                ["asc", "Chronological, oldest first"],
                ["desc", "Chronological, newest first"],
                ["provided", "Order of the field"]
            ], "asc"),
            headerPeriod: dropdown("Header period", [
                ["auto", "Current period, else latest"],
                ["latest", "Latest period"],
                ["selected", "Selected bar, else current / latest"]
            ], "auto", { description: "Period feeding the header: primary value, target, status badge and comparisons." })
        }),
        ...group("Bars", {
            layout: dropdown("Layout", [["grouped", "Grouped"], ["overlay", "Overlay"]], "grouped"),
            actualColor: color("Actual color", "#1F5F4A"),
            previousYearShow: toggle("Show previous year", true),
            previousYearColor: color("Previous year color", "#A9BDB2"),
            barSpacing: num("Spacing between periods", 35, 0, 80, { unit: "%" }),
            barMaxWidth: num("Maximum bar width", 28, 4, 80, { unit: "px" }),
            barRadius: num("Rounded bar corners", 1, 0, 8, { unit: "px" })
        }),
        ...group("Projection", {
            projectionShow: toggle("Show projection", true),
            projectionColor: color("Projection color", "#EDF1EF"),
            projectionPattern: dropdown("Projection pattern", [
                ["hatched", "Hatched"],
                ["dotted", "Dotted"],
                ["none", "None (outline only)"]
            ], "hatched"),
            projectionPatternColor: color("Pattern color", "#6E7F78"),
            projectionBorder: toggle("Projection border", true),
            projectionBorderColor: color("Border color", "#4F5B56")
        }),
        ...group("Axis and labels", {
            axisShow: toggle("Axis", true),
            axisColor: color("Axis color", "#C9D1CD"),
            gridlinesShow: toggle("Gridlines", false),
            periodLabelsShow: toggle("Period labels", true),
            periodLabelFormat: dropdown("Period label format", [["auto", "Auto (compact)"], ["provided", "As provided"]], "auto"),
            dataLabelsShow: toggle("Data labels", false),
            labelFont: font("Label font", 8),
            labelColor: color("Label color", "#5F6B66"),
            currentIndicatorShow: toggle("Current-period indicator", true),
            currentIndicatorText: text("Current-period text", "in progress"),
            legendShow: toggle("Legend", false),
            captionShow: toggle("Period count caption", true),
            captionText: text("Caption text", "", { description: "Leave empty for an automatic caption such as '4 quarter pairs'. {count} is replaced by the number of periods displayed." })
        }),
        ...group("Series names", {
            actualLabel: text("Actual", "Actual"),
            projectedLabel: text("Projected", "Projected"),
            remainingLabel: text("Projection remaining", "Projection remaining"),
            previousYearLabel: text("Previous year", "Previous year")
        })
    }),

    details: card("Details link", {
        detailsShow: topToggle("Show", true),
        detailsText: text("Text", "Details →"),
        detailsFont: font("Font", 10),
        detailsColor: color("Color", "#2F6B57"),
        detailsUnderlineOnHover: toggle("Underline on hover", true),
        detailsMinWidth: num("Minimum width", 84, 40, 240, { unit: "px", description: "The zone is always anchored bottom right and at least 28 px high, so a transparent Power BI button can be placed over it." }),
        detailsAction: dropdown("Action", [
            ["none", "None (overlay a Power BI button)"],
            ["url", "Open URL"],
            ["contextMenu", "Open drill-through menu"],
            ["select", "Select period / host event"]
        ], "none")
    }),

    interaction: card("Interaction", {
        selectionEnabled: toggle("Bar selection", true),
        multiSelect: toggle("Multi-selection (Ctrl+click)", true),
        tileAction: dropdown("Tile action", [
            ["none", "None"],
            ["select", "Select KPI"],
            ["url", "Open URL"],
            ["hostEvent", "Host event (Embedded)"]
        ], "none"),
        staticUrl: text("URL", "", { placeholder: "https://", description: "Used by the 'Open URL' actions when no Action URL field is provided. Only http(s) URLs are opened." }),
        hoverStyle: toggle("Hover feedback", true)
    }),

    accessibility: card("Accessibility", {
        a11yTitle: text("Accessible title", "", { description: "Defaults to the KPI title." }),
        a11yDescription: text("Accessible description", "", { description: "Defaults to a generated summary (value, target, status, comparisons)." }),
        keyboardFocus: toggle("Keyboard navigation", true),
        focusColor: color("Focus outline color", "#0B57D0"),
        enforceContrast: toggle("Enforce minimum contrast", false, { description: "Adjusts text colors that do not reach a 4.5:1 contrast ratio against their background." }),
        reduceMotion: toggle("Reduce motion", false, { description: "Disables transitions. Always applied when the operating system asks for reduced motion." })
    })
} as const satisfies Record<string, CardDef>;

export type Schema = typeof SCHEMA;
export type CardName = keyof Schema;

export type TileSettings = {
    -readonly [C in CardName]: {
        -readonly [P in keyof Schema[C]["props"]]: ValueOf<Schema[C]["props"][P]>
    }
};

export type ComparisonSettings = TileSettings["comparison1"];

/** Capability / persisted property names produced by a font property. */
export function fontPropertyNames(key: string): { family: string; size: string; bold: string; italic: string; underline: string } {
    return {
        family: `${key}Family`,
        size: `${key}Size`,
        bold: `${key}Bold`,
        italic: `${key}Italic`,
        underline: `${key}Underline`
    };
}
