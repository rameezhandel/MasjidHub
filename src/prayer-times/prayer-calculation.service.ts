import { Injectable } from '@nestjs/common';
import { AsrMethod, CalculationMethod as PrismaCalculationMethod } from '@prisma/client';
import {
  CalculationMethod as AdhanMethod,
  CalculationParameters,
  Coordinates,
  Madhab,
  PrayerTimes,
} from 'adhan';

export interface CalculationConfig {
  latitude: number;
  longitude: number;
  /** IANA timezone the wall-clock output is rendered in. */
  timezone: string;
  calculationMethod: PrismaCalculationMethod;
  asrMethod: AsrMethod;
}

export interface ComputedDayTimes {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

const METHOD_MAP: Record<PrismaCalculationMethod, () => CalculationParameters> = {
  MUSLIM_WORLD_LEAGUE: AdhanMethod.MuslimWorldLeague,
  ISNA: AdhanMethod.NorthAmerica,
  EGYPTIAN: AdhanMethod.Egyptian,
  UMM_AL_QURA: AdhanMethod.UmmAlQura,
  KARACHI: AdhanMethod.Karachi,
  DUBAI: AdhanMethod.Dubai,
  KUWAIT: AdhanMethod.Kuwait,
  QATAR: AdhanMethod.Qatar,
  SINGAPORE: AdhanMethod.Singapore,
  TURKEY: AdhanMethod.Turkey,
  MOON_SIGHTING_COMMITTEE: AdhanMethod.MoonsightingCommittee,
};

@Injectable()
export class PrayerCalculationService {
  /** Computes adhan times for one civil date (YYYY-MM-DD) at the masjid's location. */
  computeDay(config: CalculationConfig, date: string): ComputedDayTimes {
    const [year, month, day] = date.split('-').map(Number);
    const params = METHOD_MAP[config.calculationMethod]();
    params.madhab = config.asrMethod === AsrMethod.HANAFI ? Madhab.Hanafi : Madhab.Shafi;

    const prayerTimes = new PrayerTimes(
      new Coordinates(config.latitude, config.longitude),
      new Date(year, month - 1, day),
      params,
    );

    return {
      fajr: this.toWallClock(prayerTimes.fajr, config.timezone),
      dhuhr: this.toWallClock(prayerTimes.dhuhr, config.timezone),
      asr: this.toWallClock(prayerTimes.asr, config.timezone),
      maghrib: this.toWallClock(prayerTimes.maghrib, config.timezone),
      isha: this.toWallClock(prayerTimes.isha, config.timezone),
    };
  }

  /** "HH:MM" a given number of minutes after another "HH:MM", wrapping at midnight. */
  addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = (h * 60 + m + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  isFriday(date: string): boolean {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 5;
  }

  /** Inclusive list of YYYY-MM-DD strings between from and to. */
  enumerateDates(from: string, to: string): string[] {
    const dates: string[] = [];
    const end = new Date(`${to}T00:00:00Z`).getTime();
    for (let ts = new Date(`${from}T00:00:00Z`).getTime(); ts <= end; ts += 24 * 60 * 60 * 1000) {
      dates.push(new Date(ts).toISOString().slice(0, 10));
    }
    return dates;
  }

  private toWallClock(instant: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
  }
}
