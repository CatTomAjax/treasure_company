import type { PptState } from './ppt-model';
export function workspaceStats(state: PptState, today = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
    }).format(today),
    month = date.slice(0, 7);
  const spaces = state.collections.spaces;
  return {
    occupancy: spaces.length
      ? Math.round(
          (spaces.filter((r) => r.status === '已出租').length / spaces.length) *
            100,
        )
      : 0,
    available: spaces.filter((r) => r.status === '可租').length,
    enterprises: state.collections.enterprises.length,
    area: spaces.reduce((n, r) => n + (Number(r.area) || 0), 0),
    revenue: state.collections.bills
      .filter(
        (r) =>
          r.type === '收入' &&
          r.status === '已收款' &&
          r.date?.startsWith(month),
      )
      .reduce((n, r) => n + Number(r.amount || 0), 0),
    energy: state.collections.readings
      .filter((r) => r.type === '电' && r.date === date)
      .reduce((n, r) => n + Number(r.usage || 0), 0),
    water: state.collections.readings
      .filter((r) => r.type === '水' && r.date === date)
      .reduce((n, r) => n + Number(r.usage || 0), 0),
    pending: state.collections.services.filter((r) => r.status !== '已完成')
      .length,
    waiting: state.collections.services.filter((r) => r.status === '待受理')
      .length,
    processing: state.collections.services.filter((r) => r.status === '处理中')
      .length,
  };
}
export function cashProjection(
  state: PptState,
  delayDays = 0,
  today = new Date(),
) {
  const date = Date.parse(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
      today,
    ) + 'T00:00:00Z',
  );
  const start = Number(state.settings.cashOpeningBalance || 0);
  const incoming = [0, 0, 0, 0],
    outgoing = [0, 0, 0, 0];
  const bucket = (day: string, delay = 0) =>
    Math.max(
      0,
      Math.floor(
        (new Date(`${day}T00:00:00Z`).getTime() - date + delay * 86400000) /
          (7 * 86400000),
      ),
    );
  for (const row of state.collections.receivables.filter(
    (r) => r.status !== '已收款',
  )) {
    const week = bucket(row.date, delayDays);
    if (week < 4) incoming[week] += Number(row.amount) || 0;
  }
  for (const row of state.collections.bills.filter(
    (r) => r.type === '支出' && r.status !== '已付款',
  )) {
    const week = bucket(row.date);
    if (week < 4) outgoing[week] += Number(row.amount) || 0;
  }
  let balance = start;
  return {
    start,
    incoming,
    outgoing,
    weeks: incoming.map((income, i) => {
      const opening = balance;
      balance += income - outgoing[i];
      return { opening, income, outgoing: outgoing[i], closing: balance };
    }),
  };
}
