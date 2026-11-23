import { Theme } from "./accessibilityManager";
import { LayoutPlan } from "./layoutEngine";
import { TileSettings } from "./settingsSchema";
import { TileData } from "./types";
import { Formatters, TileView } from "./viewModel";

/** Everything a renderer needs to paint its part of the tile. */
export interface RenderContext {
    settings: TileSettings;
    data: TileData;
    view: TileView;
    plan: LayoutPlan;
    theme: Theme;
    formatters: Formatters;
    locale?: string;
}
