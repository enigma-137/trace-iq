import DottedMap from 'dotted-map';
import countryLocaleMap from 'country-locale-map';
import { alpha2ToName } from '@/lib/country-codes';

interface CountryTraffic {
  name: string;
  total: number;
}

interface MapPoint extends CountryTraffic {
  code: string;
  label: string;
  lat: number;
  lng: number;
}

const MAP_WIDTH = 800;
const MAP_HEIGHT = 400;
const ACCENT = '#3b82f6';

const dottedMap = new DottedMap({
  height: 100,
  grid: 'diagonal',
  projection: { name: 'equirectangular' },
});

const mapSvg = dottedMap.getSVG({
  radius: 0.22,
  color: '#a3a3a3',
  shape: 'circle',
  backgroundColor: 'transparent',
});

function projectPoint(lat: number, lng: number) {
  return {
    x: (lng + 180) * (MAP_WIDTH / 360),
    y: (90 - lat) * (MAP_HEIGHT / 180),
  };
}

function curvedPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const distance = Math.abs(end.x - start.x);
  const lift = Math.min(80, Math.max(28, distance * 0.16));
  const midX = (start.x + end.x) / 2;
  const midY = Math.min(start.y, end.y) - lift;
  return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
}

function toMapPoint(item: CountryTraffic): MapPoint | null {
  const code = item.name.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;

  const country = countryLocaleMap.getCountryByAlpha2(code);
  if (!country || typeof country.latitude !== 'number' || typeof country.longitude !== 'number') {
    return null;
  }

  return {
    ...item,
    code,
    label: alpha2ToName(code) ?? country.name ?? code,
    lat: country.latitude,
    lng: country.longitude,
  };
}

export function OverviewGeographyGlobe({ data }: { data: CountryTraffic[] }) {
  const points = data
    .map(toMapPoint)
    .filter((point): point is MapPoint => point !== null)
    .slice(0, 8);

  const hub = points[0];
  const hubPosition = hub ? projectPoint(hub.lat, hub.lng) : null;
  const maxValue = Math.max(1, ...points.map((point) => point.total));

  return (
    <div className="relative h-full w-full overflow-hidden bg-white dark:bg-neutral-950">
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(mapSvg)}`}
        alt="Dotted world map showing the countries sending traffic"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill opacity-55 dark:invert dark:opacity-35"
        draggable={false}
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,white,transparent_10%,transparent_88%,white)] dark:bg-[linear-gradient(to_bottom,rgb(10_10_10),transparent_10%,transparent_88%,rgb(10_10_10))]" />

      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`${points.length} countries represented on the traffic map`}
      >
        <defs>
          <linearGradient id="overview-map-route" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.12" />
            <stop offset="12%" stopColor={ACCENT} stopOpacity="0.9" />
            <stop offset="88%" stopColor={ACCENT} stopOpacity="0.9" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {hubPosition && points.slice(1).map((point, index) => {
          const end = projectPoint(point.lat, point.lng);
          return (
            <path
              key={`route-${point.code}`}
              d={curvedPath(hubPosition, end)}
              fill="none"
              stroke="url(#overview-map-route)"
              strokeWidth="1.35"
              strokeLinecap="round"
              pathLength="1"
              className="overview-map-route"
              style={{ animationDelay: `${index * 140}ms` }}
            />
          );
        })}

        {points.map((point, index) => {
          const position = projectPoint(point.lat, point.lng);
          const radius = 2.8 + Math.sqrt(point.total / maxValue) * 2.4;
          return (
            <g key={point.code}>
              <title>{`${point.label}: ${point.total.toLocaleString()} events`}</title>
              <circle
                cx={position.x}
                cy={position.y}
                r={radius * 2.5}
                fill={ACCENT}
                opacity="0.18"
                className="overview-map-pulse"
                style={{ animationDelay: `${index * 180}ms` }}
              />
              <circle
                cx={position.x}
                cy={position.y}
                r={radius}
                fill={ACCENT}
                stroke="white"
                strokeWidth="1.5"
                className="dark:stroke-neutral-950"
              />
            </g>
          );
        })}
      </svg>

      <div className="absolute bottom-3 left-3 rounded-full border border-neutral-200 bg-white/90 px-2.5 py-1 text-[10px] font-medium text-neutral-500 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85 dark:text-neutral-400">
        Top {points.length} traffic locations
      </div>
    </div>
  );
}
