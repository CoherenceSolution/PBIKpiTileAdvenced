// Extracts the JS / CSS of the packaged visual (dist/*.pbiviz) so that the harness runs the
// exact code that Power BI will load. Usage: node harness/extract.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const dist = join(root, "dist");
const pbiviz = readdirSync(dist).find(name => name.endsWith(".pbiviz"));
if (!pbiviz) {
    throw new Error("No .pbiviz in dist/ - run `npm run package` first.");
}
const tmp = join(root, ".tmp", "harness-extract");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
execFileSync("unzip", ["-q", "-o", join(dist, pbiviz), "-d", tmp]);
const resource = readdirSync(join(tmp, "resources")).find(name => name.endsWith(".pbiviz.json"));
const bundle = JSON.parse(readFileSync(join(tmp, "resources", resource), "utf8"));

const out = join(root, "harness", "build");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "visual.js"), bundle.content.js);
writeFileSync(join(out, "visual.css"), bundle.content.css);
writeFileSync(join(out, "meta.js"), `window.KPT_META = ${JSON.stringify({
    guid: bundle.visual.guid,
    displayName: bundle.visual.displayName,
    version: bundle.visual.version,
    apiVersion: bundle.apiVersion,
    capabilities: bundle.capabilities,
    stringResources: bundle.stringResources,
    icon: bundle.content.iconBase64
})};\n`);
console.log(`Extracted ${pbiviz}: js ${bundle.content.js.length} bytes, css ${bundle.content.css.length} bytes, guid ${bundle.visual.guid}`);
