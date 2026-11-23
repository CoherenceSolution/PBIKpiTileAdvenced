/**
 * Localization keys (spec 22.3). V1 ships English only, but every label of the Fields well and of
 * the format pane goes through the Power BI localization manager: adding French or Dutch later only
 * requires a new stringResources/<locale>/resources.resjson file, without touching the engine.
 *
 * stringResources/en-US/resources.resjson is generated from roles.ts and settingsSchema.ts
 * (npm run generate). Pure module.
 */
import { ROLES } from "./roles";
import { PropDef, SCHEMA } from "./settingsSchema";

const slug = (text: string): string => text.replace(/[^A-Za-z0-9]+/g, "");

export const keys = {
    role: (role: string): string => `Role_${role}`,
    roleDescription: (role: string): string => `Role_${role}_Desc`,
    card: (card: string): string => `Card_${card}`,
    cardDescription: (card: string): string => `Card_${card}_Desc`,
    group: (card: string, group: string): string => `Group_${card}_${slug(group)}`,
    prop: (card: string, prop: string): string => `Prop_${card}_${prop}`,
    propDescription: (card: string, prop: string): string => `Prop_${card}_${prop}_Desc`,
    item: (card: string, prop: string, value: string): string => `Item_${card}_${prop}_${value}`
};

/** Label of a property as shown in the format pane (the unit is part of the label). */
export function propertyLabel(def: PropDef): string {
    return def.kind === "number" && def.unit ? `${def.displayName} (${def.unit})` : def.displayName;
}

/** English resources: the content of stringResources/en-US/resources.resjson. */
export function buildStringResources(): Record<string, string> {
    const resources: Record<string, string> = {};
    for (const role of ROLES) {
        resources[keys.role(role.name)] = role.displayName;
        resources[keys.roleDescription(role.name)] = role.description;
    }
    for (const [cardName, card] of Object.entries(SCHEMA)) {
        resources[keys.card(cardName)] = card.displayName;
        if (card.description) {
            resources[keys.cardDescription(cardName)] = card.description;
        }
        for (const [propName, def] of Object.entries(card.props as Record<string, PropDef>)) {
            if (def.group) {
                resources[keys.group(cardName, def.group)] = def.group;
            }
            resources[keys.prop(cardName, propName)] = propertyLabel(def);
            if (def.description) {
                resources[keys.propDescription(cardName, propName)] = def.description;
            }
            if (def.kind === "dropdown") {
                for (const item of def.items) {
                    resources[keys.item(cardName, propName, item.value)] = item.displayName;
                }
            }
        }
    }
    return resources;
}
