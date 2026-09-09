/** Stable machine-readable venue time, even when the runtime falls back to English ICU data. */
export function venueDateTime(now = new Date()): {date: string; time: string} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vilnius', calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  return {date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}`};
}
