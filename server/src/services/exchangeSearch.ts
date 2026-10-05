import { flattenFreight } from "../lib/normalize.js";
import { transEu } from "./transEuClient.js";

export type ExchangeQuery = {
  loading_country?: string;
  loading_locality?: string;
  loading_postal?: string;
  loading_range_km?: number | null;
  loading_lat?: number | null;
  loading_lng?: number | null;
  unloading_country?: string;
  unloading_locality?: string;
  date_from?: string;
  date_to?: string;
  truck_bodies?: string[];
  vehicle_sizes?: string[];
  max_weight_t?: number | null;
  max_length_m?: number | null;
  exclude_suspended?: boolean;
  sort_field?: string;
  sort_order?: "asc" | "desc";
  limit?: number;
};

const COUNTRY_IDS: Record<string, string> = {
  al: "1_albania",
  ad: "2_andorra",
  am: "3_armenia",
  at: "4_austria",
  az: "5_azerbaijan",
  by: "6_belarus",
  be: "7_belgium",
  ba: "8_bosnia_and_herzegovina",
  bg: "9_bulgaria",
  hr: "10_croatia",
  cy: "11_cyprus",
  cz: "12_czech_republic",
  dk: "13_denmark",
  ee: "14_estonia",
  fi: "15_finland",
  fr: "16_france",
  ge: "17_georgia",
  de: "21_germany",
  gr: "22_greece",
  hu: "23_hungary",
  is: "24_iceland",
  ie: "25_ireland",
  it: "26_italy",
  kz: "27_kazakhstan",
  lv: "28_latvia",
  li: "29_liechtenstein",
  lt: "30_lithuania",
  lu: "31_luxembourg",
  mk: "32_macedonia",
  mt: "33_malta",
  md: "34_moldova",
  me: "35_montenegro",
  nl: "36_netherlands",
  no: "37_norway",
  pl: "38_poland",
  pt: "39_portugal",
  ro: "40_romania",
  ru: "41_russia",
  sm: "42_san_marino",
  rs: "43_serbia",
  sk: "44_slovakia",
  si: "45_slovenia",
  es: "55_spain",
  se: "46_sweden",
  ch: "47_switzerland",
  tr: "48_turkey",
  ua: "49_ukraine",
  gb: "50_united_kingdom",
  uk: "50_united_kingdom",
};

const COUNTRY_ISO_FROM_ID: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_IDS).map(([iso, id]) => [id, iso])
);

const TRUCK_BODY_IDS: Record<string, string> = {
  "standard-tent": "8_standard_tent",
  standard_tent: "8_standard_tent",
  tent: "8_standard_tent",
  curtainsider: "9_curtainsider",
  cooler: "10_cooler",
  isotherm: "11_isotherm",
  box: "19_box",
  mega: "20_mega",
  jumbo: "23_jumbo",
  platform: "24_platform",
  open_box: "42_open_box",
  "open-box": "42_open_box",
  tipper: "25_tipper",
  tanker: "26_tanker",
  coilmulde: "27_coilmulde",
  lowloader: "28_lowloader",
  walkingfloor: "29_walkingfloor",
  cartransporter: "30_cartransporter",
};

const VEHICLE_SIZE_IDS: Record<string, string> = {
  bus: "1_bus",
  van: "1_bus",
  lorry: "2_lorry",
  truck_tractor: "3_truck_tractor",
  "truck-tractor": "3_truck_tractor",
  double_trailer: "4_double_trailer",
  solo: "5_solo",
};

const geoCache = new Map<string, { latitude: number; longitude: number } | null>();

function prettyLabel(value: string) {
  return value.replace(/^\d+_/, "").replace(/[_-]+/g, " ");
}

function countryId(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^\d+_/.test(raw)) return raw;
  return COUNTRY_IDS[raw.toLowerCase()] || raw.toLowerCase();
}

function countryIso(value?: string | null) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d+_/.test(raw)) return COUNTRY_ISO_FROM_ID[raw] || prettyLabel(raw);
  return raw.toLowerCase();
}

function mappedList(values: string[] | undefined, dict: Record<string, string>) {
  return (values || [])
    .map((value) => {
      const raw = value.trim();
      if (!raw) return "";
      if (/^\d+_/.test(raw)) return raw;
      return dict[raw] || dict[raw.toLowerCase().replace(/\s+/g, "_")] || "";
    })
    .filter(Boolean);
}

function tzStamp(date: string, end = false) {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  return `${date}T${end ? "23:59:59.999" : "00:00:00.000"}${sign}${hh}:${mm}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (isRecord(value) && value.value != null) return num(value.value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function geocode(locality: string, country: string, postal?: string) {
  const key = [locality, postal, country].filter(Boolean).join("|").toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key) || null;
  const q = [postal, locality, countryIso(country) || country].filter(Boolean).join(", ");
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TNL-LaneDesk/1.0 (trans.tnlcrm.com)" },
  });
  const rows = (await res.json().catch(() => [])) as Array<{ lat?: string; lon?: string }>;
  const hit = rows[0];
  const coords =
    hit?.lat && hit?.lon ? { latitude: Number(hit.lat), longitude: Number(hit.lon) } : null;
  geoCache.set(key, coords);
  return coords;
}

function rangeObject(to?: number | null) {
  return to != null && Number.isFinite(to) ? { to } : undefined;
}

export async function buildExchangeFilter(query: ExchangeQuery) {
  const filter: Record<string, unknown> = {
    places_matching_type: "cross",
    exclude_suspended: query.exclude_suspended !== false,
  };

  const loadingCountry = countryId(query.loading_country);
  const unloadingCountry = countryId(query.unloading_country);
  const locality = query.loading_locality?.trim() || "";
  const postal = query.loading_postal?.trim() || "";
  let lat = query.loading_lat ?? null;
  let lng = query.loading_lng ?? null;

  if (locality && (lat == null || lng == null)) {
    const coords = await geocode(locality, query.loading_country || "", postal);
    if (coords) {
      lat = coords.latitude;
      lng = coords.longitude;
    }
  }

  if (loadingCountry || locality || postal || (lat != null && lng != null)) {
    const place: Record<string, unknown> = {};
    if (loadingCountry || locality || postal) {
      place.address = {
        ...(loadingCountry ? { country: [loadingCountry] } : {}),
        ...(locality ? { locality } : {}),
        ...(postal ? { postal_code: postal } : {}),
      };
    }
    if (lat != null && lng != null) {
      place.coordinates = {
        latitude: lat,
        longitude: lng,
        range: query.loading_range_km || 150,
      };
    }
    filter.loading_place = [place];
  }

  if (unloadingCountry || query.unloading_locality) {
    filter.unloading_place = [
      {
        address: {
          ...(unloadingCountry ? { country: [unloadingCountry] } : {}),
          ...(query.unloading_locality ? { locality: query.unloading_locality.trim() } : {}),
        },
      },
    ];
  }

  if (query.date_from || query.date_to) {
    const from = query.date_from || query.date_to || "";
    const to = query.date_to || query.date_from || "";
    const window = { from: tzStamp(from), to: tzStamp(to, true) };
    filter.loading_date = window;
    filter.available_on = window;
  }

  const bodies = mappedList(query.truck_bodies, TRUCK_BODY_IDS);
  if (bodies.length) filter.required_truck_body = bodies;

  const sizes = mappedList(query.vehicle_sizes, VEHICLE_SIZE_IDS);
  if (sizes.length) {
    filter.size = sizes;
    filter.required_vehicle_size = sizes;
  }

  const weight = rangeObject(query.max_weight_t);
  if (weight) {
    filter.load_weight = weight;
    filter.cargo_capacity = weight;
  }
  const length = rangeObject(query.max_length_m);
  if (length) {
    filter.load_length = length;
    filter.cargo_length = length;
  }

  return filter;
}

function labels(values: unknown): string[] {
  if (!Array.isArray(values)) return typeof values === "string" && values ? [prettyLabel(values)] : [];
  return values.map((item) => prettyLabel(String(item))).filter(Boolean);
}

export function presentExchangeOffer(raw: Record<string, unknown>) {
  const flat = flattenFreight(raw, "exchange");
  const freight = isRecord(raw.freight) ? raw.freight : raw;
  const requirements = isRecord(freight.requirements) ? freight.requirements : isRecord(raw.requirements) ? raw.requirements : {};
  const distanceRaw = num(freight.distance) ?? num(raw.distance);
  const distanceM =
    distanceRaw == null
      ? flat.distance_m
      : distanceRaw > 0 && distanceRaw < 20_000
        ? Math.round(distanceRaw * 1000)
        : Math.round(distanceRaw);

  return {
    id: String(raw.id || freight.id || ""),
    freight_id: freight.id ?? raw.freight_id ?? null,
    shipper_name: flat.shipper_name,
    loading_country: countryIso(flat.loading_country) || flat.loading_country,
    loading_locality: flat.loading_locality,
    unloading_country: countryIso(flat.unloading_country) || flat.unloading_country,
    unloading_locality: flat.unloading_locality,
    loading_at: flat.loading_at,
    unloading_at: flat.unloading_at,
    distance_m: distanceM,
    weight_t: flat.weight_t ?? num(raw.load_weight) ?? num(raw.cargo_capacity),
    length_m: num(freight.length) ?? num(raw.length) ?? num(raw.load_length) ?? num(raw.cargo_length),
    truck_bodies: flat.truck_bodies.length
      ? flat.truck_bodies.map((item) => prettyLabel(String(item)))
      : labels(raw.required_truck_body || raw.truck_body || requirements.required_truck_bodies),
    vehicle_sizes: labels(raw.size || raw.required_vehicle_size || requirements.vehicle_size || flat.vehicle_size),
    published_price: flat.published_price,
    published_currency: flat.published_currency,
    status: flat.status,
    url: raw.id ? `https://platform.trans.eu/exchange/offers/${raw.id}` : "https://platform.trans.eu/exchange/offers",
  };
}

export async function searchExchange(query: ExchangeQuery) {
  const filter = await buildExchangeFilter(query);
  const result = await transEu.searchFreightOffers({
    filter,
    limit: query.limit ?? 100,
    sortField: query.sort_field || "index",
    sortOrder: query.sort_order || "desc",
  });
  return {
    total: result.total,
    filter,
    items: result.items.map((item) => presentExchangeOffer(item)),
  };
}
