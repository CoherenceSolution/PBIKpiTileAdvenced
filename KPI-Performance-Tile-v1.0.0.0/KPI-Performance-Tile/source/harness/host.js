/* Minimal fake of the Power BI host, for local rendering checks only (not shipped in the visual). */
(function () {
    "use strict";

    const ROLE_OF = {
        primary: "primaryValue", secondary: "secondaryValue", secondaryLabel: "secondaryLabel",
        actual: "actualValue", projected: "projectedValue", remaining: "projectionRemaining",
        py: "previousYearValue", target: "targetValue", targetVariance: "targetVariance",
        cmp1: "comparison1Value", cmp1Label: "comparison1Label", cmp2: "comparison2Value", cmp2Label: "comparison2Label",
        statusValue: "statusValue", statusCode: "statusCode", statusLabel: "statusLabel",
        isCurrent: "isCurrentPeriod", tech: "kpiTechnicalName", title: "kpiTitle", subtitle: "kpiSubtitle",
        category: "kpiCategory", url: "actionUrl"
    };

    /** Builds a categorical dataView from a compact scenario description. */
    function buildDataView(scenario) {
        if (scenario.empty) {
            return undefined;
        }
        const rows = scenario.rows || [];
        const columns = [];
        const categories = [];
        if (!scenario.noPeriod) {
            const source = { displayName: "Period", roles: { period: true }, format: scenario.periodFormat, queryName: "Calendar.Period" };
            columns.push(source);
            categories.push({ source, values: rows.map(r => r.period), identity: rows.map((_, i) => ({ key: "p" + i })) });
            if (rows.some(r => r.sortKey !== undefined)) {
                const sortSource = { displayName: "Period Sort Key", roles: { periodSortKey: true }, queryName: "Calendar.SortKey" };
                columns.push(sortSource);
                categories.push({ source: sortSource, values: rows.map(r => r.sortKey), identity: rows.map((_, i) => ({ key: "p" + i })) });
            }
        }
        const values = [];
        const names = scenario.names || {};
        const formats = scenario.formats || {};
        Object.keys(ROLE_OF).forEach(key => {
            if (!rows.some(r => r[key] !== undefined)) {
                return;
            }
            const role = ROLE_OF[key];
            const source = { displayName: names[key] || role, roles: { [role]: true }, format: formats[key], isMeasure: true, queryName: "Measures." + role };
            columns.push(source);
            const column = { source, values: rows.map(r => (r[key] === undefined ? null : r[key])) };
            if (scenario.highlights && scenario.highlights[key]) {
                column.highlights = scenario.highlights[key];
            }
            values.push(column);
        });
        (scenario.tooltipFields || []).forEach(field => {
            const source = { displayName: field.name, roles: { tooltips: true }, format: field.format, isMeasure: true };
            columns.push(source);
            values.push({ source, values: rows.map((r, i) => (Array.isArray(field.values) ? field.values[i] : field.values)) });
        });
        return {
            metadata: { columns, objects: scenario.objects || {} },
            categorical: { categories: categories.length ? categories : undefined, values: values.length ? values : undefined }
        };
    }

    function createHost(options) {
        options = options || {};
        const log = options.log || function () {};
        let selected = [];
        let selectCallback = null;
        const tooltip = document.createElement("div");
        tooltip.className = "fake-tooltip";
        tooltip.style.display = "none";
        document.body.appendChild(tooltip);

        const makeId = key => ({
            key,
            equals(other) { return !!other && other.key === key; },
            getKey() { return key; },
            getSelector() { return { data: [key] }; },
            includes(other) { return this.equals(other); },
            hasIdentity() { return true; }
        });

        const renderTooltip = (args, element) => {
            while (tooltip.firstChild) { tooltip.removeChild(tooltip.firstChild); }
            const items = args.dataItems || [];
            if (items.length && items[0].header) {
                const header = document.createElement("div");
                header.className = "fake-tooltip-header";
                header.textContent = items[0].header;
                tooltip.appendChild(header);
            }
            items.forEach(item => {
                const row = document.createElement("div");
                row.className = "fake-tooltip-row";
                const name = document.createElement("span");
                if (item.color) {
                    const dot = document.createElement("i");
                    dot.style.background = item.color;
                    name.appendChild(dot);
                }
                name.appendChild(document.createTextNode(item.displayName));
                const value = document.createElement("b");
                value.textContent = item.value;
                row.appendChild(name);
                row.appendChild(value);
                tooltip.appendChild(row);
            });
            const rect = element.getBoundingClientRect();
            tooltip.style.display = "block";
            tooltip.style.left = (window.scrollX + rect.left + args.coordinates[0] + 14) + "px";
            tooltip.style.top = (window.scrollY + rect.top + args.coordinates[1] + 14) + "px";
        };

        const host = {
            locale: options.locale || "en-US",
            hostCapabilities: { allowInteractions: options.allowInteractions !== false },
            colorPalette: options.highContrast
                ? { isHighContrast: true, foreground: { value: "#FFFFFF" }, background: { value: "#000000" }, foregroundSelected: { value: "#1AEBFF" }, hyperlink: { value: "#FFFF00" } }
                : { isHighContrast: false, foreground: { value: "#252423" }, background: { value: "#FFFFFF" }, foregroundSelected: { value: "#000000" }, hyperlink: { value: "#0078D4" } },
            eventService: {
                renderingStarted() { host.stats.started++; },
                renderingFinished() { host.stats.finished++; },
                renderingFailed(_, reason) { host.stats.failed++; host.stats.errors.push(String(reason)); log("renderingFailed: " + reason); }
            },
            stats: { started: 0, finished: 0, failed: 0, errors: [], urls: [], contextMenus: [], tooltips: [] },
            tooltipService: {
                enabled() { return true; },
                show(args) { host.stats.tooltips.push(args); renderTooltip(args, host.element); },
                move(args) { renderTooltip(args, host.element); },
                hide() { tooltip.style.display = "none"; }
            },
            createSelectionIdBuilder() {
                let key = "";
                const builder = {
                    withCategory(category, index) { key += "c" + index; return builder; },
                    withMeasure(name) { key += "m" + name; return builder; },
                    withSeries() { return builder; },
                    createSelectionId() { return makeId(key); }
                };
                return builder;
            },
            createSelectionManager() {
                return {
                    select(ids, multi) {
                        const list = Array.isArray(ids) ? ids : [ids];
                        selected = multi ? selected.concat(list) : list.slice();
                        log("select " + selected.map(id => id.key).join(","));
                        return Promise.resolve(selected);
                    },
                    clear() { selected = []; log("clear selection"); return Promise.resolve(); },
                    getSelectionIds() { return selected.slice(); },
                    hasSelection() { return selected.length > 0; },
                    registerOnSelectCallback(callback) { selectCallback = callback; },
                    showContextMenu(id, position) { host.stats.contextMenus.push({ id: id && id.key, position }); log("contextMenu " + (id && id.key)); return Promise.resolve(); }
                };
            },
            /** Simulates a bookmark being applied by Power BI. */
            applyBookmark(keys) {
                selected = keys.map(makeId);
                if (selectCallback) { selectCallback(selected); }
            },
            getSelectedKeys() { return selected.map(id => id.key); },
            launchUrl(url) { host.stats.urls.push(url); log("launchUrl " + url); },
            createLocalizationManager() {
                // Same behaviour as Power BI: the string of the locale, else the en-US one, else the key.
                const all = (window.KPT_META && window.KPT_META.stringResources) || {};
                const pick = locale => (Array.isArray(all) ? (all.find(r => r.locale === locale) || {}).values : all[locale]) || {};
                const current = pick(host.locale);
                const fallback = pick("en-US");
                return { getDisplayName: key => current[key] || fallback[key] || key };
            },
            displayWarningIcon() {},
            persistProperties() {},
            refreshHostData() {},
            instanceId: "harness"
        };
        return host;
    }

    /** Creates a visual instance in `container` and renders the scenario. */
    function mount(container, scenario, size, hostOptions) {
        const meta = window.KPT_META;
        const plugin = window.powerbi.visuals.plugins[meta.guid];
        const element = document.createElement("div");
        element.className = "fake-visual";
        element.style.width = size.width + "px";
        element.style.height = size.height + "px";
        container.appendChild(element);
        const host = createHost(Object.assign({}, hostOptions, scenario.host));
        host.element = element;
        const visual = plugin.create({ element, host });
        const update = (next, nextSize) => {
            const s = next || scenario;
            const dataView = buildDataView(s);
            visual.update({ dataViews: dataView ? [dataView] : [], viewport: nextSize || size, type: 2 });
        };
        update();
        return { visual, host, element, update };
    }

    window.KPT_HARNESS = { buildDataView, createHost, mount, ROLE_OF };
})();
