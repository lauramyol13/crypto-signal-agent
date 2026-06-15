import { Venue } from "../common/types.js";
import { downloadKlines } from "./collectorBinance.js";

function parseVenue(v?: string): Venue {
  if (!v) return Venue.BINANCE;
  const found = Object.values(Venue).find((x) => x === v.toLowerCase());
  if (!found) throw new Error(`Unknown venue: ${v}`);
  return found;
}

export function getDownloadFunctions(venue: Venue): typeof downloadKlines {
  if (venue === Venue.BINANCE) return downloadKlines;
  throw new Error(`Downloader not implemented for venue: ${venue}`);
}

export { parseVenue };
