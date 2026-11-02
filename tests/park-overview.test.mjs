import assert from 'node:assert/strict';
import test from 'node:test';
import { parkOverview, spaceRelations } from '../lib/park-overview.ts';

const state = (collections = {}) => ({ settings: {}, events: [], collections });
const item = (id, fields = {}) => ({
  id,
  title: id,
  status: '进行中',
  ...fields,
});

test('space links use IDs first and never match unrelated rooms or enterprises', () => {
  const room = item('space-a', {
    title: 'A101',
    status: '已出租',
    owner: '星河科技',
  });
  const data = state({
    enterprises: [item('unrelated', { title: '星河科技服务商' })],
    services: [
      item('by-name', { space: 'A101' }),
      item('wrong-id', { spaceId: 'space-b', space: 'A101' }),
      item('closed', { spaceId: room.id, status: '已完成' }),
    ],
    meters: [item('meter', { spaceId: room.id, space: '旧房号' })],
    leases: [item('lease', { spaceId: room.id })],
  });
  const linked = spaceRelations(data, room);
  assert.equal(linked.tenant, '星河科技');
  assert.equal(linked.enterprise, undefined);
  assert.deepEqual(
    linked.services.map((row) => row.id),
    ['by-name'],
  );
  assert.deepEqual(
    linked.meters.map((row) => row.id),
    ['meter'],
  );
  assert.equal(linked.leases.length, 1);
  data.collections.enterprises.push(
    item('explicit', { title: '已更名的企业' }),
  );
  assert.equal(
    spaceRelations(data, { ...room, enterpriseId: 'explicit' }).enterprise.id,
    'explicit',
  );
  assert.equal(
    spaceRelations(data, { ...room, owner: '', enterpriseId: 'explicit' })
      .tenant,
    '已更名的企业',
  );
});

test('renewal appointments are not treated as lease expiry; 30-day window and canceled records are respected', () => {
  const result = parkOverview(
    state({
      leases: [
        item('appointment', { status: '待确认', date: '2026-11-05' }),
        item('expired', { endDate: '2026-11-02' }),
        item('today', { endDate: '2026-11-03' }),
        item('boundary', { endDate: '2026-12-03', status: '待确认' }),
        item('future', { endDate: '2026-12-04' }),
        item('canceled', { endDate: '2026-11-06', status: '已取消' }),
      ],
    }),
    '2026-11-03',
  );
  assert.deepEqual(
    result.expiring.map((row) => row.id),
    ['today', 'boundary'],
  );
  assert.equal(result.renewals.length, 2);
  assert.equal(result.leaseAttention, 3);
});

test('monthly income uses received records only; missing readings stay distinguishable from measured zero', () => {
  const result = parkOverview(
    state({
      spaces: [
        item('a', { status: '已出租', area: '45' }),
        item('b', { status: '可租', area: '60' }),
        item('c', { status: '已预约' }),
        item('d', { status: '维护中' }),
      ],
      bills: [
        item('paid', {
          type: '收入',
          status: '已收款',
          date: '2026-11-02',
          amount: '1200',
        }),
        item('unpaid', {
          type: '收入',
          status: '待收款',
          date: '2026-11-03',
          amount: '800',
        }),
        item('past', {
          type: '收入',
          status: '已收款',
          date: '2026-10-31',
          amount: '500',
        }),
      ],
      readings: [
        item('old', { type: '电', date: '2026-11-02', usage: '99' }),
        item('zero', { type: '水', date: '2026-11-03', usage: '0' }),
      ],
      services: [
        item('waiting', { status: '待受理' }),
        item('processing', { status: '处理中' }),
        item('done', { status: '已完成' }),
        item('cancel', { status: '已取消' }),
      ],
    }),
    '2026-11-03',
  );
  assert.equal(result.occupancy, 25);
  assert.equal(result.available.length, 1);
  assert.equal(result.reserved.length, 1);
  assert.equal(result.otherSpaces.length, 1);
  assert.equal(result.area, 105);
  assert.equal(result.revenue, 1200);
  assert.equal(
    result.readings.some((row) => row.type === '电'),
    false,
  );
  assert.equal(
    result.readings.some((row) => row.type === '水'),
    true,
  );
  assert.equal(result.water, 0);
  assert.equal(result.services.length, 2);
  assert.equal(result.completed, 1);
});

test('an empty workspace produces no fabricated occupancy, income, or alerts', () => {
  const result = parkOverview(state(), '2026-11-03');
  assert.equal(result.occupancy, 0);
  assert.equal(result.revenue, 0);
  assert.equal(
    result.services.length + result.abnormal.length + result.leaseAttention,
    0,
  );
  assert.equal(result.readings.length, 0);
});
