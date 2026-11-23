/**
 * Status badge logic. Two modes (spec 9.4):
 *  - Thresholds: Status Value compared with per-instance thresholds;
 *  - Status Code: state computed in DAX (recommended for complex rules).
 * Pure module.
 */
import { StatusState, TileSettings } from "./settingsSchema";
import { PeriodPoint, StatusCode, StatusResult, TileData } from "./types";

const CODE_TO_STATE: Record<StatusCode, StatusState> = {
    ON_TARGET: "onTarget",
    NEAR_TARGET: "nearTarget",
    BELOW_TARGET: "belowTarget",
    ABOVE_TARGET: "aboveTarget",
    NO_TARGET: "noTarget",
    NO_DATA: "noData",
    CUSTOM: "custom"
};

const KNOWN_CODES = Object.keys(CODE_TO_STATE) as StatusCode[];

export function normaliseStatusCode(raw: string | null): StatusCode | null {
    if (!raw) {
        return null;
    }
    const code = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
    return (KNOWN_CODES as string[]).includes(code) ? (code as StatusCode) : null;
}

export interface ThresholdRules {
    direction: "higher" | "lower" | "neutral";
    onTargetThreshold: number;
    nearThreshold: number;
    aboveEnabled: boolean;
    aboveThreshold: number;
}

/**
 * Compares a status value with the thresholds.
 * Only the distance of the near / above thresholds to the on-target threshold matters, so a rule
 * entered as (0, -0.05) works for "higher is better" as well as "lower is better".
 */
export function evaluateThresholds(value: number, rules: ThresholdRules): StatusCode {
    const tolerance = Math.abs(rules.nearThreshold - rules.onTargetThreshold);
    const margin = Math.abs(rules.aboveThreshold - rules.onTargetThreshold);
    if (rules.direction === "lower") {
        if (rules.aboveEnabled && margin > 0 && value <= rules.onTargetThreshold - margin) {
            return "ABOVE_TARGET";
        }
        if (value <= rules.onTargetThreshold) {
            return "ON_TARGET";
        }
        return value <= rules.onTargetThreshold + tolerance ? "NEAR_TARGET" : "BELOW_TARGET";
    }
    // higher is better, and neutral (same position logic, neutral colors applied by the caller)
    if (rules.direction === "neutral") {
        if (value >= rules.onTargetThreshold) {
            return "ABOVE_TARGET";
        }
        return value >= rules.onTargetThreshold - tolerance ? "NEAR_TARGET" : "BELOW_TARGET";
    }
    if (rules.aboveEnabled && margin > 0 && value >= rules.onTargetThreshold + margin) {
        return "ABOVE_TARGET";
    }
    if (value >= rules.onTargetThreshold) {
        return "ON_TARGET";
    }
    return value >= rules.onTargetThreshold - tolerance ? "NEAR_TARGET" : "BELOW_TARGET";
}

function defaultLabel(state: StatusState, settings: TileSettings["statusBadge"]): string {
    return (settings as unknown as Record<string, string>)[`${state}Text`] ?? "";
}

function headerValue(reference: PeriodPoint): number | null {
    return reference.primary ?? reference.secondary;
}

export function computeStatus(data: TileData, settings: TileSettings): StatusResult {
    const s = settings.statusBadge;
    const reference = data.reference;
    const make = (code: StatusCode, stateOverride?: StatusState, labelOverride?: string | null, visible = true): StatusResult => {
        const state = stateOverride ?? CODE_TO_STATE[code];
        const label = labelOverride || reference?.statusLabel || defaultLabel(CODE_TO_STATE[code], s);
        return { code, state, label, visible: visible && s.badgeShow };
    };

    if (!reference || (headerValue(reference) === null && !reference.statusCode && reference.statusValue === null)) {
        return make("NO_DATA");
    }

    const useCode = s.mode === "statusCode" || (s.mode === "auto" && !!data.bound.statusCode);
    if (useCode) {
        if (!reference.statusCode) {
            return make("NO_TARGET", undefined, undefined, s.showNoTarget);
        }
        const code = normaliseStatusCode(reference.statusCode);
        if (code === null) {
            // Unknown code: neutral style, the raw text is shown unless a Status Label is provided.
            return make("CUSTOM", "custom", reference.statusLabel ?? reference.statusCode);
        }
        if (code === "NO_TARGET") {
            return make(code, undefined, undefined, s.showNoTarget);
        }
        return make(code);
    }

    // Thresholds mode
    let statusValue = reference.statusValue;
    if (statusValue === null && !data.bound.statusValue) {
        // Presentation fallback: relative gap between the displayed value and the target.
        const value = headerValue(reference);
        if (value !== null && reference.target !== null && reference.target !== 0) {
            statusValue = (value - reference.target) / Math.abs(reference.target);
        }
    }
    if (statusValue === null) {
        return make("NO_TARGET", undefined, undefined, s.showNoTarget);
    }
    const code = evaluateThresholds(statusValue, s);
    return s.direction === "neutral" ? make(code, "custom") : make(code);
}
