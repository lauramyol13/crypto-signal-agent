import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, App } from "../src/service/app.js";
import { generateSyntheticKlines } from "../src/inputs/collectorBinance.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = process.argv[2] ?? "configs/config-test-pipeline.jsonc";
loadConfig(path.join(ROOT, configFile));
generateSyntheticKlines(App.config, App.config.data_sources ?? [], Number(process.argv[3] ?? 800));
