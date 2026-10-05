import { haversineKm } from "./pricing.js";

export type SpotLike = {
  operations?: Array<{
    type?: string;
    timespans?: { begin?: string; end?: string };
  }>;
  place?: {
    address?: {
      country?: string;
      locality?: string;
      postal_code?: string;
    };
    coordinates?: { latitude?: number; longitude?: number };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstSpot(spots: SpotLike[] | undefined, type: string) {
  return (spots || []).find((s) => s.operations?.some((op) => op.type === type));
}

function asAddress(value: unknown): { country?: string; locality?: string; postal_code?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const country = Array.isArray(value.country) ? value.country[0] : value.country;
  return {
    country: typeof country === "string" ? country : undefined,
    locality: typeof value.locality === "string" ? value.locality : undefined,
    postal_code: typeof value.postal_code === "string" ? value.postal_code : undefined,
  };
}

function asCoords(value: unknown): { latitude?: number; longitude?: number } | undefined {
  if (!isRecord(value)) return undefined;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { latitude, longitude };
}

function placeBlock(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (!isRecord(value)) continue;
    const address = asAddress(value.address) || asAddress(value.place) || asAddress(value);
    const coordinates = asCoords(value.coordinates) || asCoords(value);
    if (address || coordinates) return { address, coordinates, timespans: isRecord(value.timespans) ? value.timespans : undefined };
  }
  return undefined;
}

function opTime(spot: SpotLike | undefined, type: string) {
  const op = spot?.operations?.find((o) => o.type === type);
  return op?.timespans?.begin || null;
}

export function extractRoute(raw: Record<string, unknown>) {
  const freight = (raw.freight as Record<string, unknown>) || raw;
  const spots = (freight.spots as SpotLike[]) || [];
  const loadingSpot = firstSpot(spots, "loading");
  const unloadingSpot = firstSpot(spots, "unloading");
  const loadingPlace = placeBlock(raw, "loading_place", "loading") || placeBlock(freight, "loading_place", "loading");
  const unloadingPlace = placeBlock(raw, "unloading_place", "unloading") || placeBlock(freight, "unloading_place", "unloading");

  const loadAddr = loadingSpot?.place?.address || loadingPlace?.address;
  const unloadAddr = unloadingSpot?.place?.address || unloadingPlace?.address;

  const loadCoords = loadingSpot?.place?.coordinates || loadingPlace?.coordinates;
  const unloadCoords = unloadingSpot?.place?.coordinates || unloadingPlace?.coordinates;

  const loadingAt =
    opTime(loadingSpot, "loading") ||
    (typeof loadingPlace?.timespans?.begin === "string" ? loadingPlace.timespans.begin : null) ||
    (isRecord(raw.loading_date) && typeof raw.loading_date.from === "string" ? raw.loading_date.from : null) ||
    null;
  const unloadingAt =
    opTime(unloadingSpot, "unloading") ||
    (typeof unloadingPlace?.timespans?.begin === "string" ? unloadingPlace.timespans.begin : null) ||
    (isRecord(raw.unloading_date) && typeof raw.unloading_date.from === "string" ? raw.unloading_date.from : null) ||
    null;

  let distanceM =
    Number((freight.distance as number) || (raw.distance as number) || 0) || null;
  if (!distanceM && loadCoords?.latitude && unloadCoords?.latitude) {
    distanceM = Math.round(
      haversineKm(
        { lat: Number(loadCoords.latitude), lng: Number(loadCoords.longitude) },
        { lat: Number(unloadCoords.latitude), lng: Number(unloadCoords.longitude) }
      ) * 1000
    );
  }

  return {
    loading_country: (loadAddr?.country || "").toLowerCase() || null,
    loading_locality: loadAddr?.locality || null,
    loading_postal: loadAddr?.postal_code || null,
    loading_lat: loadCoords?.latitude ?? null,
    loading_lng: loadCoords?.longitude ?? null,
    loading_at: loadingAt,
    unloading_country: (unloadAddr?.country || "").toLowerCase() || null,
    unloading_locality: unloadAddr?.locality || null,
    unloading_postal: unloadAddr?.postal_code || null,
    unloading_lat: unloadCoords?.latitude ?? null,
    unloading_lng: unloadCoords?.longitude ?? null,
    unloading_at: unloadingAt,
    distance_m: distanceM,
  };
}

export function flattenFreight(raw: Record<string, unknown>, source: string) {
  const freight = ((raw.freight as Record<string, unknown>) || raw) as Record<string, unknown>;
  const publication =
    (freight.publication as Record<string, unknown>) ||
    (raw.publication as Record<string, unknown>) ||
    {};
  const requirements = (freight.requirements as Record<string, unknown>) || (raw.requirements as Record<string, unknown>) || {};
  const transport = (requirements.transport as Record<string, unknown>) || {};
  const shipper = (freight.shipper as Record<string, unknown>) || (raw.company as Record<string, unknown>) || {};
  const price =
    (raw.price as { value?: number; currency?: string }) ||
    (publication.price as { value?: number; currency?: string }) ||
    (isRecord(raw.payment) && isRecord(raw.payment.price) ? raw.payment.price : {}) ||
    {};
  const period = (publication.period as { days?: number; payment?: string }) || {};
  const route = extractRoute(raw);
  const truckBodies =
    (requirements.required_truck_bodies as string[]) ||
    (raw.truck_bodies as string[]) ||
    [];
  const capacity = freight.capacity as { value?: number } | undefined;
  const loadingMeters = freight.loading_meters as { value?: number } | undefined;

  return {
    trans_freight_id: Number(freight.id || raw.id) || null,
    trans_offer_id: typeof raw.id === "string" ? raw.id : null,
    source,
    reference_number: (freight.shipment_external_id as string) || (raw.reference_number as string) || null,
    status: (raw.status as string) || (publication.status as string) || "active",
    shipper_name: (shipper.legal_name as string) || (shipper.name as string) || null,
    shipper_vat: (shipper.vat_id as string) || null,
    shipper_company_id: (shipper.company_id as number) || null,
    ...route,
    weight_t: capacity?.value ?? (typeof freight.capacity === "number" ? freight.capacity : null) ?? (typeof raw.capacity === "number" ? raw.capacity : null) ?? (raw.volume as number) ?? null,
    loading_meters: loadingMeters?.value ?? null,
    volume: (raw.volume as number) ?? null,
    truck_bodies: truckBodies,
    vehicle_size: (requirements.vehicle_size_id as string) || (raw.vehicle_size as string) || null,
    transport_type: (transport.type as string) || (raw.transport_type as string) || null,
    ftl: Boolean(requirements.is_ftl ?? raw.ftl),
    published_price: price.value ?? null,
    published_currency: (price.currency || "eur").toUpperCase(),
    price_type: (raw.price_type as string) || (publication.price_type as string) || "route",
    payment_days: period.days ?? null,
    payment_type: period.payment ?? null,
    is_first_buy: Boolean(raw.is_first_buy),
    is_quick_pay: Boolean(raw.is_quick_pay ?? publication.is_quick_pay),
    decision_date: (raw.decision_date as string) || null,
    publish_date: (raw.publish_date as string) || (publication.publish_date as string) || null,
    raw,
  };
}

export function routeKey(row: {
  loading_country?: string | null;
  unloading_country?: string | null;
  loading_locality?: string | null;
  unloading_locality?: string | null;
}) {
  return [
    (row.loading_country || "?").toLowerCase(),
    (row.loading_locality || "?").toLowerCase(),
    (row.unloading_country || "?").toLowerCase(),
    (row.unloading_locality || "?").toLowerCase(),
  ].join(">");
}
