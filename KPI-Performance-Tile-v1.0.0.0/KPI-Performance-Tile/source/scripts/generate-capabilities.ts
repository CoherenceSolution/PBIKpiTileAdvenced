/**
 * Generates capabilities.json from the two sources of truth:
 *   - src/roles.ts          (data roles)
 *   - src/settingsSchema.ts (formatting properties)
 * Run with: npm run generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildStringResources, keys } from "../src/localization";
import { ROLES } from "../src/roles";
import { PropDef, SCHEMA, fontPropertyNames } from "../src/settingsSchema";

type Json = Record<string, unknown>;

function propertyType(def: PropDef, cardName: string, key: string): Json {
    switch (def.kind) {
        case "toggle":
            return { bool: true };
        case "color":
            return { fill: { solid: { color: true } } };
        case "number":
            return { numeric: true };
        case "text":
            return { text: true };
        case "dropdown":
            return {
                enumeration: def.items.map(item => ({
                    value: item.value,
                    displayName: item.displayName,
                    displayNameKey: keys.item(cardName, key, item.value)
                }))
            };
        case "align":
            return { formatting: { alignment: true } };
        case "font":
            throw new Error("font properties are expanded by the caller");
    }
}

function buildObjects(): Json {
    const objects: Json = {};
    for (const [cardName, card] of Object.entries(SCHEMA)) {
        const properties: Json = {};
        for (const [key, def] of Object.entries(card.props as Record<string, PropDef>)) {
            if (def.kind === "font") {
                const names = fontPropertyNames(key);
                properties[names.family] = { type: { formatting: { fontFamily: true } } };
                properties[names.size] = { type: { formatting: { fontSize: true } } };
                properties[names.bold] = { type: { bool: true } };
                properties[names.italic] = { type: { bool: true } };
                properties[names.underline] = { type: { bool: true } };
            } else {
                properties[key] = { type: propertyType(def, cardName, key) };
            }
        }
        objects[cardName] = { properties };
    }
    return objects;
}

const groupingRoles = ROLES.filter(role => role.kind === "Grouping");
const measureRoles = ROLES.filter(role => role.kind === "Measure");

const capabilities = {
    dataRoles: ROLES.map(role => ({
        displayName: role.displayName,
        name: role.name,
        displayNameKey: keys.role(role.name),
        kind: role.kind,
        description: role.description,
        descriptionKey: keys.roleDescription(role.name)
    })),
    dataViewMappings: [
        {
            conditions: [
                Object.fromEntries(ROLES.map(role => [role.name, { max: role.max }]))
            ],
            categorical: {
                categories: {
                    select: groupingRoles.map(role => ({ bind: { to: role.name } })),
                    // One aggregated row per period is expected; 36 are displayed at most.
                    dataReductionAlgorithm: { top: { count: 1000 } }
                },
                values: {
                    select: measureRoles.map(role => (role.max > 1 ? { for: { in: role.name } } : { bind: { to: role.name } }))
                }
            }
        }
    ],
    objects: buildObjects(),
    sorting: { default: {} },
    tooltips: {
        supportedTypes: { default: true, canvas: true },
        roles: ["tooltips"],
        supportEnhancedTooltips: true
    },
    supportsHighlight: true,
    supportsKeyboardFocus: true,
    supportsLandingPage: true,
    supportsEmptyDataView: true,
    supportsMultiVisualSelection: true,
    suppressDefaultTitle: true,
    // No web access, no local storage, no export: nothing to declare.
    privileges: []
};

// Run from the project root (npm run generate).
const target = resolve(process.cwd(), "capabilities.json");
writeFileSync(target, JSON.stringify(capabilities, null, 4) + "\n", "utf8");

// English string resources (the only locale shipped in V1).
const resources = buildStringResources();
const resourcesFolder = resolve(process.cwd(), "stringResources", "en-US");
mkdirSync(resourcesFolder, { recursive: true });
writeFileSync(resolve(resourcesFolder, "resources.resjson"), JSON.stringify(resources, null, 4) + "\n", "utf8");

const propertyCount = Object.values(capabilities.objects as Record<string, { properties: Json }>)
    .reduce((total, card) => total + Object.keys(card.properties).length, 0);
console.log(`capabilities.json written: ${capabilities.dataRoles.length} data roles, ${Object.keys(capabilities.objects).length} cards, ${propertyCount} properties.`);
console.log(`stringResources/en-US/resources.resjson written: ${Object.keys(resources).length} strings.`);
