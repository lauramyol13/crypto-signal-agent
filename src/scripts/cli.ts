import { Command } from "commander";
import path from "node:path";
import { parseVenue, getDownloadFunctions } from "../inputs/index.js";
import { App, loadConfig } from "../service/app.js";

export function createCli(name: string, action: (configFile: string) => void | Promise<void>): Command {
  const program = new Command();
  program
    .name(name)
    .option("-c, --config-file <path>", "Configuration file name", "")
    .action(async (opts: { configFile: string }) => {
      await action(opts.configFile);
    });
  return program;
}

export async function runDownload(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  const venue = parseVenue(config.venue);
  const downloadFn = getDownloadFunctions(venue);
  const started = Date.now();
  await downloadFn(config, config.data_sources ?? []);
  const elapsed = Math.floor((Date.now() - started) / 1000);
  console.log(`Finished downloading in ${elapsed}s`);
}

export function resolveDataPath(...parts: string[]): string {
  return path.join(...parts);
}
