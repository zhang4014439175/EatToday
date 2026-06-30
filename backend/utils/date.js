const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getShanghaiDatePrefix(date = new Date()) {
  const shanghaiDate = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const year = shanghaiDate.getUTCFullYear();
  const month = String(shanghaiDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shanghaiDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getShanghaiDayUtcRange(date = new Date()) {
  const shanghaiDate = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const year = shanghaiDate.getUTCFullYear();
  const month = shanghaiDate.getUTCMonth();
  const day = shanghaiDate.getUTCDate();
  const startUtc = new Date(Date.UTC(year, month, day) - SHANGHAI_OFFSET_MS);
  const endUtc = new Date(Date.UTC(year, month, day + 1) - SHANGHAI_OFFSET_MS);

  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString()
  };
}
