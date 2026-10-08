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
/** 끝 날짜도 포함한다. 다음 날의 경계에서 1ms를 빼 서머타임 변화를 보존한다. */
export function calendarDateFilter(value: string, end: boolean, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value)
    return value;
  return new Date(
    midnight(timestamp + (end ? 86400000 : 0), timeZone) - (end ? 1 : 0),
  ).toISOString();
}
