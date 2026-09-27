import { SITES, fmtDT } from './mock';
import type { RegionWeather, WeatherDay, RiskLevel } from '../types';

export type DayRating = 'GOOD' | 'CAUTION' | 'POOR';

const CACHE_TTL_MS = 30 * 60 * 1000;

const cache = new Map<
  string,
  {
    ts: number;
    data: RegionWeather;
  }
>();

/**
 * Safely convert an unknown API value into a finite number.
 *
 * Open-Meteo can return null for some marine/weather values.
 * Never allow null/undefined/NaN to reach calculations or .toFixed().
 */
function safeNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return fallback;
}

/**
 * Numeric value required for calculations.
 */
function safeNumberOr(
  value: unknown,
  fallback = 0,
): number {
  const n = safeNumber(value, null);
  return n == null ? fallback : n;
}

export function nearestSite(
  lat: number,
  lng: number,
): string {
  let best = SITES[0];
  let bestDist = Infinity;

  for (const s of SITES) {
    const d =
      (s.lat - lat) ** 2 +
      (s.lng - lng) ** 2;

    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }

  return best.name;
}

export function compass(
  deg: number,
): string {
  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];

  if (!Number.isFinite(deg)) {
    return '—';
  }

  return dirs[
    Math.round(
      ((deg % 360) / 22.5),
    ) % 16
  ];
}

export function weatherLabel(
  code: number,
): string {
  if (!Number.isFinite(code)) {
    return '—';
  }

  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';

  return '—';
}

export function seaState(
  m: number,
): {
  label: string;
  tone: 'teal' | 'accent' | 'critical';
} {
  if (!Number.isFinite(m)) {
    return {
      label: 'UNKNOWN',
      tone: 'accent',
    };
  }

  if (m < 1) {
    return {
      label: 'CALM',
      tone: 'teal',
    };
  }

  if (m < 1.5) {
    return {
      label: 'MODERATE',
      tone: 'accent',
    };
  }

  if (m < 2.5) {
    return {
      label: 'ROUGH',
      tone: 'critical',
    };
  }

  return {
    label: 'VERY ROUGH',
    tone: 'critical',
  };
}

export function windCondition(
  kmh: number,
): string {
  if (!Number.isFinite(kmh)) {
    return 'Unknown';
  }

  if (kmh < 11) return 'Light';
  if (kmh < 21) return 'Gentle';
  if (kmh < 31) return 'Moderate';
  if (kmh < 45) return 'Strong';

  return 'Gale';
}

export function rateDay(
  waveMax: number,
  windKmh: number,
  gustKmh: number,
  precipProb: number,
): DayRating {
  /*
   * These values are guaranteed numeric before reaching this function.
   */

  if (
    waveMax >= 2.5 ||
    windKmh >= 42 ||
    gustKmh >= 62 ||
    precipProb >= 90
  ) {
    return 'POOR';
  }

  const good =
    waveMax <= 1.2 &&
    windKmh <= 26 &&
    gustKmh <= 40 &&
    precipProb <= 50;

  return good
    ? 'GOOD'
    : 'CAUTION';
}

export function bestWindow(
  days: WeatherDay[],
): {
  start: string;
  end: string;
  count: number;
} | null {
  if (!days.length) {
    return null;
  }

  const runs = (
    rating: DayRating,
  ) => {
    let run = 0;
    let best = 0;
    let start = -1;

    days.forEach((d, i) => {
      run =
        d.rating === rating
          ? run + 1
          : 0;

      if (run > best) {
        best = run;
        start = i - run + 1;
      }
    });

    if (
      best <= 0 ||
      start < 0
    ) {
      return null;
    }

    return {
      start: days[start].date,
      end:
        days[start + best - 1]
          .date,
      count: best,
    };
  };

  return (
    runs('GOOD') ??
    runs('CAUTION')
  );
}

export function dayLabel(
  date: string,
): string {
  const parsed =
    new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(
    'en',
    {
      weekday: 'short',
      day: 'numeric',
    },
  );
}

export type TaskVerdict =
  | 'MISSED'
  | 'OUTLOOK'
  | 'AT_RISK'
  | 'TIGHT'
  | 'ON_TRACK';

export interface TaskPlan {
  verdict: TaskVerdict;
  overdue: boolean;
  hoursLeft: number;
  deadlineLabel: string;
  headline: string;
  detail: string;
}

function localKey(
  d: Date,
): string {
  const p = (
    n: number,
  ) =>
    String(n).padStart(2, '0');

  return `${d.getFullYear()}-${p(
    d.getMonth() + 1,
  )}-${p(d.getDate())}`;
}

const RANK: Record<
  DayRating,
  number
> = {
  GOOD: 0,
  CAUTION: 1,
  POOR: 2,
};

function planText(
  verdict: TaskVerdict,
  riskLevel: RiskLevel,
  deadlineLabel: string,
  hoursLeft: number,
  win: ReturnType<
    typeof bestWindow
  >,
  leastBad: WeatherDay | null,
  lastForecast: string,
): [string, string] {
  if (verdict === 'MISSED') {
    return [
      `Response window has passed (${deadlineLabel})`,
      `Treat as ${
        riskLevel === 'critical'
          ? 'critical — escalate now'
          : 'escalated / overdue'
      }: dispatch only in the next calm gap (waves below 1.5 m, wind under 30 km/h), complete the run, then close the case.`,
    ];
  }

  if (verdict === 'OUTLOOK') {
    return [
      `Deadline ${deadlineLabel} is beyond the 7-day outlook`,
      `Re-check the forecast after ${
        lastForecast || 'tomorrow'
      }. Execute only once waves stay below 1.5 m for 24 h and wind remains under 30 km/h.`,
    ];
  }

  if (
    verdict === 'AT_RISK' ||
    !win ||
    !leastBad
  ) {
    return [
      `Sea state blocks dispatch before ${deadlineLabel}`,
      `Every day before the deadline is rated POOR (waves ≥ 2.5 m / strong wind / heavy rain). Do not sail — hold or escalate the case, and keep monitoring until conditions ease.`,
    ];
  }

  if (verdict === 'ON_TRACK') {
    return [
      `Complete during ${dayLabel(
        win.start,
      )}${
        win.count > 1
          ? ` → ${dayLabel(
              win.end,
            )}`
          : ''
      }`,
      `${win.count}-day calm window opens before the ${deadlineLabel} deadline (waves ≤ 1.2 m, wind ≤ 26 km/h, rain ≤ 50%). Book the day-run for ${dayLabel(
        win.start,
      )} — starting earlier in the window leaves buffer if conditions shift. ${Math.round(
        hoursLeft,
      )} h remain.`,
    ];
  }

  /*
   * Defensive guard.
   *
   * planTask normally guarantees leastBad exists here,
   * but this prevents a rendering crash if weather data
   * becomes incomplete.
   */
  if (!leastBad) {
    return [
      'Weather data unavailable',
      'The forecast does not contain enough valid marine-weather data to calculate a dispatch window.',
    ];
  }

  const waveText =
    safeNumber(
      leastBad.waveMax,
      null,
    ) == null
      ? '—'
      : leastBad.waveMax.toFixed(
          1,
        );

  const windText =
    safeNumber(
      leastBad.windMaxKmh,
      null,
    ) == null
      ? '—'
      : Math.round(
          leastBad.windMaxKmh,
        ).toString();

  const rainText =
    safeNumber(
      leastBad.precipProb,
      null,
    ) == null
      ? '—'
      : Math.round(
          leastBad.precipProb,
        ).toString();

  return [
    `Tight — best attempt ${dayLabel(
      leastBad.date,
    )} at first light`,
    `No fully-good day before ${deadlineLabel}. Least-rough pre-deadline day is ${dayLabel(
      leastBad.date,
    )} (waves ${waveText} m, wind ${windText} km/h, rain ${rainText}%). Sail at dawn, verify on departure, and keep manual verification on return.`,
  ];
}

export function planTask(
  days: WeatherDay[],
  deadlineIso: string,
  riskLevel: RiskLevel,
): TaskPlan {
  const now = new Date();

  const deadline =
    new Date(deadlineIso);

  const deadlineTime =
    deadline.getTime();

  /*
   * Defensive handling for malformed dates.
   */
  if (
    Number.isNaN(deadlineTime)
  ) {
    return {
      verdict: 'AT_RISK',
      overdue: false,
      hoursLeft: 0,
      deadlineLabel: 'Unknown',
      headline:
        'Weather planning unavailable',
      detail:
        'The response deadline is invalid, so a weather-based dispatch plan cannot be calculated.',
    };
  }

  const hoursLeft =
    (deadlineTime -
      now.getTime()) /
    3600e3;

  const overdue =
    hoursLeft <= 0;

  const deadlineLabel =
    fmtDT(deadlineIso);

  const today =
    localKey(now);

  const dKey =
    localKey(deadline);

  const lastForecast =
    days.length
      ? days[days.length - 1].date
      : '';

  const relevant =
    days.filter(
      (d) =>
        d.date >= today &&
        d.date <= dKey,
    );

  const win =
    bestWindow(relevant);

  const leastBad =
    relevant.length
      ? [
          ...relevant,
        ].sort(
          (a, b) =>
            RANK[a.rating] -
              RANK[b.rating] ||
            safeNumberOr(
              a.waveMax,
            ) -
              safeNumberOr(
                b.waveMax,
              ),
        )[0]
      : null;

  const verdict: TaskVerdict =
    overdue
      ? 'MISSED'
      : !lastForecast ||
          dKey > lastForecast
        ? 'OUTLOOK'
        : !win || !leastBad
          ? 'AT_RISK'
          : relevant.find(
                (d) =>
                  d.date ===
                  win.start,
              )?.rating ===
              'GOOD'
            ? 'ON_TRACK'
            : 'TIGHT';

  const [
    headline,
    detail,
  ] = planText(
    verdict,
    riskLevel,
    deadlineLabel,
    hoursLeft,
    win,
    leastBad,
    lastForecast,
  );

  return {
    verdict,
    overdue,
    hoursLeft,
    deadlineLabel,
    headline,
    detail,
  };
}

export async function fetchRegionWeather(
  lat: number,
  lng: number,
): Promise<RegionWeather> {
  /*
   * Validate coordinates before requesting the API.
   */
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new Error(
      'Invalid coordinates for weather lookup.',
    );
  }

  const ck = `${lat.toFixed(
    2,
  )}:${lng.toFixed(2)}`;

  const hit =
    cache.get(ck);

  if (
    hit &&
    Date.now() - hit.ts <
      CACHE_TTL_MS
  ) {
    return hit.data;
  }

  const ll =
    `latitude=${lat.toFixed(4)}` +
    `&longitude=${lng.toFixed(4)}`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?${ll}` +
    `&timezone=auto` +
    `&forecast_days=7` +
    `&current=wave_height,wind_wave_height,swell_wave_height,wave_direction,wave_period` +
    `&daily=wave_height_max,wave_period_max,wave_direction_dominant,wind_wave_height_max,swell_wave_height_max`;

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?${ll}` +
    `&timezone=auto` +
    `&forecast_days=7` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max,precipitation_sum,weather_code`;

  const [
    marineRes,
    forecastRes,
  ] = await Promise.all([
    fetch(marineUrl),
    fetch(forecastUrl),
  ]);

  if (
    !marineRes.ok ||
    !forecastRes.ok
  ) {
    throw new Error(
      'weather service unreachable',
    );
  }

  const [
    marine,
    forecast,
  ] = await Promise.all([
    marineRes.json(),
    forecastRes.json(),
  ]);

  /*
   * Make sure the APIs actually returned the structures
   * required by the application.
   */
  if (
    !marine?.daily ||
    !forecast?.daily ||
    !Array.isArray(
      forecast.daily.time,
    )
  ) {
    throw new Error(
      'weather service returned invalid forecast data',
    );
  }

  const days: WeatherDay[] =
    forecast.daily.time.map(
      (
        date: string,
        i: number,
      ) => {
        /*
         * Marine values.
         *
         * Missing values receive safe numerical defaults
         * because rateDay() requires numbers.
         */
        const waveMax =
          safeNumberOr(
            marine.daily
              ?.wave_height_max?.[
              i
            ],
            0,
          );

        const wavePeriodMax =
          safeNumberOr(
            marine.daily
              ?.wave_period_max?.[
              i
            ],
            0,
          );

        const waveDirection =
          safeNumber(
            marine.daily
              ?.wave_direction_dominant?.[
              i
            ],
            null,
          );

        /*
         * Weather values.
         */
        const windMaxKmh =
          safeNumberOr(
            forecast.daily
              ?.wind_speed_10m_max?.[
              i
            ],
            0,
          );

        const windGustsKmh =
          safeNumberOr(
            forecast.daily
              ?.wind_gusts_10m_max?.[
              i
            ],
            windMaxKmh,
          );

        const precipProb =
          safeNumberOr(
            forecast.daily
              ?.precipitation_probability_max?.[
              i
            ],
            0,
          );

        const precipSum =
          safeNumberOr(
            forecast.daily
              ?.precipitation_sum?.[
              i
            ],
            0,
          );

        const weatherCode =
          safeNumberOr(
            forecast.daily
              ?.weather_code?.[
              i
            ],
            0,
          );

        const tempMax =
          safeNumberOr(
            forecast.daily
              ?.temperature_2m_max?.[
              i
            ],
            0,
          );

        const tempMin =
          safeNumberOr(
            forecast.daily
              ?.temperature_2m_min?.[
              i
            ],
            0,
          );

        return {
          date,

          waveMax,

          wavePeriodMax,

          waveDirection,

          windMaxKmh,

          windGustsKmh,

          precipProb,

          precipSum,

          weatherCode,

          tempMax,

          tempMin,

          rating: rateDay(
            waveMax,
            windMaxKmh,
            windGustsKmh,
            precipProb,
          ),
        };
      },
    );

  const data: RegionWeather =
    {
      lat,
      lng,

      region:
        nearestSite(
          lat,
          lng,
        ),

      fetchedAt:
        new Date().toISOString(),

      current: {
        /*
         * Current values are allowed to remain null because
         * the WeatherReport component already knows how to
         * display unavailable values as "—".
         */
        waveHeight:
          safeNumber(
            marine.current
              ?.wave_height,
            null,
          ),

        wavePeriod:
          safeNumber(
            marine.current
              ?.wave_period,
            null,
          ),

        waveDirection:
          safeNumber(
            marine.current
              ?.wave_direction,
            null,
          ),

        windSpeedKmh:
          safeNumber(
            forecast.current
              ?.wind_speed_10m,
            null,
          ),

        windDirectionDeg:
          safeNumber(
            forecast.current
              ?.wind_direction_10m,
            null,
          ),

        tempC:
          safeNumber(
            forecast.current
              ?.temperature_2m,
            null,
          ),

        weatherCode:
          safeNumber(
            forecast.current
              ?.weather_code,
            null,
          ),
      },

      days,
    };

  cache.set(
    ck,
    {
      ts: Date.now(),
      data,
    },
  );

  return data;
}