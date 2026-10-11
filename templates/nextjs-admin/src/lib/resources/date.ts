import "server-only";
function midnight(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  let current = timestamp;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(current)).map((part) => [part.type, part.value]),
    );
    const wall = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const offset = wall - timestamp;
    if (offset === 0) break;
    current -= offset;
  }
  return current;
}
/** 끝 날짜를 포함하도록 배타적인 종료 시각을 다음 날의 경계로 보낸다. */
export function calendarDateFilter(value: string, end: boolean, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value)
    return value;
  return new Date(midnight(timestamp + (end ? 86400000 : 0), timeZone)).toISOString();
}

/** ISO 종료 경계의 직전 시각이 속한 날짜를 입력에 표시한다. */
export function filterCalendarDate(value: string, end: boolean, timeZone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp - (end ? 1 : 0)));
}
