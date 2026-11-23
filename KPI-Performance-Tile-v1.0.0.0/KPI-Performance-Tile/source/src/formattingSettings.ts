/**
 * Builds the modern Power BI format pane (getFormattingModel) from the declarative schema.
 */
import powerbi from "powerbi-visuals-api";
import { formattingSettings, FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";

import { keys, propertyLabel } from "./localization";
import { CardName, PropDef, SCHEMA, TileSettings, fontPropertyNames } from "./settingsSchema";

import FormattingModel = powerbi.visuals.FormattingModel;

type Slice = formattingSettings.Slice;
type SimpleSlice = formattingSettings.SimpleSlice;

// const enums of the API are not available at runtime in every bundler: use their literal values.
const VALIDATOR_MIN = 0 as powerbi.visuals.ValidatorType;
const VALIDATOR_MAX = 1 as powerbi.visuals.ValidatorType;
const ALIGNMENT_HORIZONTAL = "horizontalAlignment" as unknown as powerbi.visuals.AlignmentGroupMode;

class DynamicGroup extends formattingSettings.Group {
    constructor(name: string, displayName: string) {
        super({ name, displayName, slices: [], collapsible: true } as unknown as formattingSettings.Group);
    }
}

class DynamicCompositeCard extends formattingSettings.CompositeCard {
    public groups: formattingSettings.Group[] = [];

    constructor(name: string, displayName: string, description?: string) {
        super();
        this.name = name;
        this.displayName = displayName;
        this.description = description;
    }
}

class DynamicSimpleCard extends formattingSettings.SimpleCard {
    constructor(name: string, displayName: string, description?: string) {
        super();
        this.name = name;
        this.displayName = displayName;
        this.description = description;
        this.slices = [];
    }
}

function numberOptions(def: Extract<PropDef, { kind: "number" }>): powerbi.visuals.NumUpDownFormat {
    const options: powerbi.visuals.NumUpDownFormat = {};
    if (def.min !== undefined) {
        options.minValue = { type: VALIDATOR_MIN, value: def.min } as powerbi.visuals.MinValidator<number>;
    }
    if (def.max !== undefined) {
        options.maxValue = { type: VALIDATOR_MAX, value: def.max } as powerbi.visuals.MaxValidator<number>;
    }
    return options;
}

/**
 * `localized` is true when the host provides a localization manager: labels are then resolved
 * from stringResources through their keys, with the English text as a fallback.
 */
function createSlice(cardName: string, key: string, def: PropDef, value: unknown, localized: boolean): Slice {
    const base: { name: string; displayName: string; description?: string; displayNameKey?: string; descriptionKey?: string } = {
        name: key,
        displayName: propertyLabel(def),
        description: def.description
    };
    if (localized) {
        base.displayNameKey = keys.prop(cardName, key);
        if (def.description) {
            base.descriptionKey = keys.propDescription(cardName, key);
        }
    }
    switch (def.kind) {
        case "toggle":
            return new formattingSettings.ToggleSwitch({ ...base, value: value as boolean });
        case "color":
            return new formattingSettings.ColorPicker({ ...base, value: { value: value as string } });
        case "number":
            return new formattingSettings.NumUpDown({ ...base, value: value as number, options: numberOptions(def) });
        case "text":
            return new formattingSettings.TextInput({ ...base, value: value as string, placeholder: def.placeholder ?? "" });
        case "dropdown": {
            const items = def.items.map(item => (localized
                ? { value: item.value, displayName: item.displayName, displayNameKey: keys.item(cardName, key, item.value) }
                : { value: item.value, displayName: item.displayName }));
            const current = items.find(item => item.value === value) ?? items[0];
            return new formattingSettings.ItemDropdown({ ...base, items, value: current });
        }
        case "align":
            return new formattingSettings.AlignmentGroup({ ...base, mode: ALIGNMENT_HORIZONTAL, value: value as string });
        case "font": {
            const names = fontPropertyNames(key);
            const font = value as TileSettings["header"]["titleFont"];
            return new formattingSettings.FontControl({
                name: key,
                displayName: def.displayName,
                displayNameKey: base.displayNameKey,
                fontFamily: new formattingSettings.FontPicker({ name: names.family, value: font.family }),
                fontSize: new formattingSettings.NumUpDown({
                    name: names.size,
                    value: font.size,
                    options: {
                        minValue: { type: VALIDATOR_MIN, value: 6 } as powerbi.visuals.MinValidator<number>,
                        maxValue: { type: VALIDATOR_MAX, value: 72 } as powerbi.visuals.MaxValidator<number>
                    }
                }),
                bold: new formattingSettings.ToggleSwitch({ name: names.bold, value: font.bold }),
                italic: new formattingSettings.ToggleSwitch({ name: names.italic, value: font.italic }),
                underline: new formattingSettings.ToggleSwitch({ name: names.underline, value: font.underline })
            });
        }
    }
}

function buildCard(cardName: CardName, settings: TileSettings, localized: boolean): formattingSettings.Cards {
    const def = SCHEMA[cardName];
    const props = def.props as Record<string, PropDef>;
    const values = settings[cardName] as Record<string, unknown>;
    const propNames = Object.keys(props);
    const hasGroups = propNames.some(name => props[name].group !== undefined);

    if (!hasGroups) {
        const card = new DynamicSimpleCard(cardName, def.displayName, def.description);
        if (localized) {
            card.displayNameKey = keys.card(cardName);
        }
        for (const name of propNames) {
            const slice = createSlice(cardName, name, props[name], values[name], localized);
            if (props[name].top) {
                card.topLevelSlice = slice as SimpleSlice;
            } else {
                (card.slices as Slice[]).push(slice);
            }
        }
        return card;
    }

    const card = new DynamicCompositeCard(cardName, def.displayName, def.description);
    if (localized) {
        card.displayNameKey = keys.card(cardName);
    }
    const groups = new Map<string, DynamicGroup>();
    for (const name of propNames) {
        const prop = props[name];
        const slice = createSlice(cardName, name, prop, values[name], localized);
        if (prop.group === undefined && prop.top) {
            // on/off switch of the whole card
            card.topLevelSlice = slice as SimpleSlice;
            continue;
        }
        const groupName = prop.group ?? "General";
        let group = groups.get(groupName);
        if (!group) {
            group = new DynamicGroup(`${cardName}_${groupName.replace(/[^A-Za-z0-9]+/g, "")}`, groupName);
            if (localized && prop.group !== undefined) {
                group.displayNameKey = keys.group(cardName, groupName);
            }
            groups.set(groupName, group);
            card.groups.push(group);
        }
        if (prop.top) {
            group.topLevelSlice = slice as SimpleSlice;
        } else {
            (group.slices as Slice[]).push(slice);
        }
    }
    return card;
}

/**
 * Builds the formatting model shown in the format pane for the current settings.
 * Pass `localized = true` when the service was created with the host localization manager.
 */
export function buildFormattingModel(settings: TileSettings, service: FormattingSettingsService, localized = false): FormattingModel {
    const model = new formattingSettings.Model();
    model.cards = (Object.keys(SCHEMA) as CardName[]).map(cardName => buildCard(cardName, settings, localized));
    return service.buildFormattingModel(model);
}
