import countryLocaleMap from 'country-locale-map';
import { alpha2ToName } from '@/lib/country-codes';
import { OverviewTrafficMap, type TrafficMapPoint } from './OverviewTrafficMap';

interface CountryTraffic {
  name: string;
  total: number;
}

function toMapPoint(item: CountryTraffic): TrafficMapPoint | null {
  const code = item.name.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;

  const country = countryLocaleMap.getCountryByAlpha2(code);
  if (!country) return null;

  // The package declarations say number, while its current dataset stores strings.
  const lat = Number(country.latitude);
  const lng = Number(country.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    code,
    label: alpha2ToName(code) ?? country.name ?? code,
    total: item.total,
    lat,
    lng,
  };
}

export function OverviewGeographyGlobe({ data }: { data: CountryTraffic[] }) {
  const points = data
    .map(toMapPoint)
    .filter((point): point is TrafficMapPoint => point !== null)
    .slice(0, 8);

  return <OverviewTrafficMap points={points} />;
}
