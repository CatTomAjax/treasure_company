import type { PptItem, PptState } from './ppt-model';

const active = (row: PptItem) =>
  !/^(已完成|已关闭|已取消|已作废)$/.test(row.status);
export const spaceTone = (status: string) =>
  status === '已出租'
    ? 'occupied'
    : status === '可租'
      ? 'available'
      : status === '已预约'
        ? 'reserved'
        : 'other';

function belongsToSpace(row: PptItem, room: PptItem) {
  // Explicit IDs take precedence over display names, which may change.
  if (row.spaceId) return row.spaceId === room.id;
  return row.space === room.title;
}

export function spaceRelations(state: PptState, room: PptItem) {
  const rows = state.collections;
  const tenant =
    room.tenant ||
    room.company ||
    (room.status === '已出租' ? room.owner : '') ||
    '';
  const enterprise = (rows.enterprises || []).find((row) =>
    room.enterpriseId
      ? row.id === room.enterpriseId
      : Boolean(tenant) && row.title === tenant,
  );
  return {
    tenant: enterprise?.title || tenant,
    enterprise,
    leases: (rows.leases || []).filter(
      (row) => belongsToSpace(row, room) && active(row),
    ),
    bookings: (rows.bookings || []).filter(
      (row) => belongsToSpace(row, room) && active(row),
    ),
    services: (rows.services || []).filter(
      (row) => belongsToSpace(row, room) && active(row),
    ),
    meters: (rows.meters || []).filter((row) => belongsToSpace(row, room)),
  };
}

export function parkOverview(state: PptState, today: string) {
  const rows = state.collections;
  const spaces = rows.spaces || [];
  const occupied = spaces.filter((room) => room.status === '已出租');
  const available = spaces.filter((room) => room.status === '可租');
  const reserved = spaces.filter((room) => room.status === '已预约');
  const otherSpaces = spaces.filter(
    (room) => !['已出租', '可租', '已预约'].includes(room.status),
  );
  const services = (rows.services || []).filter(active);
  const abnormal = (rows.meters || []).filter((row) => row.status === '异常');
  const renewals = (rows.leases || []).filter((row) => row.status === '待确认');
  const day = Date.parse(`${today}T00:00:00Z`);
  const expiring = (rows.leases || []).filter((row) => {
    if (!active(row)) return false;
    // A renewal appointment's `date` is not the end date of a lease.
    const end = row.endDate || row.leaseEndDate || row.leaseEnd;
    const diff = (Date.parse(`${end}T00:00:00Z`) - day) / 86400000;
    return Number.isFinite(diff) && diff >= 0 && diff <= 30;
  });
  const readings = (rows.readings || []).filter((row) => row.date === today);
  const income = (rows.bills || []).filter(
    (row) =>
      row.type === '收入' &&
      row.status === '已收款' &&
      row.date?.startsWith(today.slice(0, 7)),
  );
  const completed = (rows.services || []).filter(
    (row) => row.status === '已完成',
  ).length;
  return {
    spaces,
    occupied,
    available,
    reserved,
    otherSpaces,
    services,
    abnormal,
    renewals,
    expiring,
    readings,
    income,
    completed,
    leaseAttention: new Set([...renewals, ...expiring].map((row) => row.id))
      .size,
    occupancy: spaces.length
      ? Math.round((occupied.length / spaces.length) * 100)
      : 0,
    area: spaces.reduce((sum, row) => sum + (Number(row.area) || 0), 0),
    revenue: income.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    enterpriseCount: (rows.enterprises || []).length,
    waiting: services.filter((row) => row.status === '待受理').length,
    processing: services.filter((row) => row.status === '处理中').length,
    energy: readings
      .filter((row) => row.type === '电')
      .reduce((sum, row) => sum + (Number(row.usage) || 0), 0),
    water: readings
      .filter((row) => row.type === '水')
      .reduce((sum, row) => sum + (Number(row.usage) || 0), 0),
  };
}
