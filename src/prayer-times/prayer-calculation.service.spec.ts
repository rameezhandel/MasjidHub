import { AsrMethod, CalculationMethod } from '@prisma/client';
import { CalculationConfig, PrayerCalculationService } from './prayer-calculation.service';

describe('PrayerCalculationService', () => {
  const service = new PrayerCalculationService();

  const toronto: CalculationConfig = {
    latitude: 43.6532,
    longitude: -79.3832,
    timezone: 'America/Toronto',
    calculationMethod: CalculationMethod.ISNA,
    asrMethod: AsrMethod.STANDARD,
  };

  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

  it('produces well-formed, correctly ordered times', () => {
    const times = service.computeDay(toronto, '2026-08-01');
    for (const value of Object.values(times)) {
      expect(value).toMatch(TIME);
    }
    expect(minutes(times.fajr)).toBeLessThan(minutes(times.dhuhr));
    expect(minutes(times.dhuhr)).toBeLessThan(minutes(times.asr));
    expect(minutes(times.asr)).toBeLessThan(minutes(times.maghrib));
    expect(minutes(times.maghrib)).toBeLessThan(minutes(times.isha));
  });

  it('renders wall-clock in the masjid timezone, not the server timezone', () => {
    const inToronto = service.computeDay(toronto, '2026-08-01');
    const inKarachi = service.computeDay({ ...toronto, timezone: 'Asia/Karachi' }, '2026-08-01');
    // Same instants formatted in a timezone 9-10 hours apart must differ.
    expect(inToronto.dhuhr).not.toBe(inKarachi.dhuhr);
  });

  it('Hanafi asr is later than standard asr', () => {
    const standard = service.computeDay(toronto, '2026-08-01');
    const hanafi = service.computeDay({ ...toronto, asrMethod: AsrMethod.HANAFI }, '2026-08-01');
    expect(minutes(hanafi.asr)).toBeGreaterThan(minutes(standard.asr));
  });

  it('different calculation methods give different fajr', () => {
    const isna = service.computeDay(toronto, '2026-08-01');
    const mwl = service.computeDay(
      { ...toronto, calculationMethod: CalculationMethod.MUSLIM_WORLD_LEAGUE },
      '2026-08-01',
    );
    expect(isna.fajr).not.toBe(mwl.fajr);
  });

  it('addMinutes wraps at midnight', () => {
    expect(service.addMinutes('04:45', 20)).toBe('05:05');
    expect(service.addMinutes('23:50', 20)).toBe('00:10');
  });

  it('detects Fridays', () => {
    expect(service.isFriday('2026-08-07')).toBe(true);
    expect(service.isFriday('2026-08-08')).toBe(false);
  });

  it('enumerates inclusive date ranges', () => {
    expect(service.enumerateDates('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });
});
