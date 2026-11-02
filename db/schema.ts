import {
  mysqlTable,
  varchar,
  longtext,
  bigint,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const agentJobs = mysqlTable(
  'treasure_agent_jobs',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    runId: varchar('runId', { length: 191 }).notNull(),
    generation: bigint('generation', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    requestedBy: varchar('requestedBy', { length: 191 }).notNull(),
    attempts: bigint('attempts', { mode: 'number' }).notNull().default(0),
    availableAt: varchar('availableAt', { length: 191 }).notNull(),
    owner: varchar('owner', { length: 191 }).notNull().default(''),
    token: varchar('token', { length: 191 }).notNull().default(''),
    lastError: longtext('lastError')
      .notNull()
      .default(sql`('')`),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [
    uniqueIndex('agent_job_generation').on(t.companyId, t.runId, t.generation),
    index('agent_job_queue').on(t.status, t.availableAt),
    check(
      'treasure_agent_job_status',
      sql`${t.status} IN ('queued','running','retry_wait','done','paused','cancelled','failed')`,
    ),
    foreignKey({
      name: 'treasure_agent_jobs_requestedBy_treasure_platform_users_id_fk',
      columns: [t.requestedBy],
      foreignColumns: [platformUsers.id],
    }),
    foreignKey({
      name: 'treasure_agent_jobs_companyId_runId_treasure_agent__eae4e5e6d8',
      columns: [t.companyId, t.runId],
      foreignColumns: [agentRuns.companyId, agentRuns.id],
    }),
  ],
);
export const agentWorkers = mysqlTable('treasure_agent_workers', {
  id: varchar('id', { length: 191 }).primaryKey(),
  owner: varchar('owner', { length: 191 }).notNull(),
  heartbeatAt: varchar('heartbeatAt', { length: 191 }).notNull(),
  leaseUntil: varchar('leaseUntil', { length: 191 }).notNull(),
});
export const modelPreferences = mysqlTable(
  'treasure_model_preferences',
  {
    companyId: varchar('companyId', { length: 191 }).notNull(),
    projectId: varchar('projectId', { length: 191 }).notNull().default(''),
    connectionId: varchar('connectionId', { length: 191 }).notNull(),
    model: varchar('model', { length: 191 }).notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(1),
    updatedBy: varchar('updatedBy', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.projectId] }),
    foreignKey({
      name: 'treasure_model_preferences_companyId_treasure_finan_58021201e6',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
    foreignKey({
      name: 'treasure_model_preferences_connectionId_treasure_in_cb352190cb',
      columns: [t.connectionId],
      foreignColumns: [integrationConnections.id],
    }),
  ],
);
export const modelTests = mysqlTable(
  'treasure_model_tests',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    connectionId: varchar('connectionId', { length: 191 }).notNull(),
    connectionVersion: varchar('connectionVersion', { length: 191 }).notNull(),
    model: varchar('model', { length: 191 }).notNull(),
    kind: varchar('kind', { length: 191 }).notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    latencyMs: bigint('latencyMs', { mode: 'number' }).notNull(),
    inputTokens: bigint('inputTokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('outputTokens', { mode: 'number' })
      .notNull()
      .default(0),
    message: longtext('message').notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    actor: varchar('actor', { length: 191 }).notNull(),
  },
  (t) => [
    index('idx_model_tests').on(t.companyId, t.connectionId, t.createdAt),
    foreignKey({
      name: 'treasure_model_tests_companyId_treasure_finance_companies_id_fk',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
    foreignKey({
      name: 'treasure_model_tests_connectionId_treasure_integrat_7ef1933bf3',
      columns: [t.connectionId],
      foreignColumns: [integrationConnections.id],
    }),
  ],
);
export const modelCatalogs = mysqlTable(
  'treasure_model_catalogs',
  {
    connectionId: varchar('connectionId', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    models: longtext('models').notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [
    check('treasure_model_catalog_json', sql`json_valid(${t.models})`),
    foreignKey({
      name: 'treasure_model_catalogs_connectionId_treasure_integ_b58f68ab2e',
      columns: [t.connectionId],
      foreignColumns: [integrationConnections.id],
    }),
    foreignKey({
      name: 'treasure_model_catalogs_companyId_treasure_financ_614b6ddfb4',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);

export const agentPolicies = mysqlTable(
  'treasure_agent_policies',
  {
    companyId: varchar('companyId', { length: 191 }).notNull(),
    projectId: varchar('projectId', { length: 191 }).notNull().default(''),
    config: longtext('config').notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(1),
    updatedBy: varchar('updatedBy', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.projectId] }),
    check('treasure_agent_policy_json', sql`json_valid(${t.config})`),
    foreignKey({
      name: 'treasure_agent_policies_companyId_treasure_financ_f0ac28144c',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);
export const agentRuns = mysqlTable(
  'treasure_agent_runs',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    projectId: varchar('projectId', { length: 191 }).notNull().default(''),
    sceneId: varchar('sceneId', { length: 191 }).notNull(),
    title: longtext('title').notNull(),
    goal: longtext('goal').notNull(),
    input: longtext('input').notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(1),
    generation: bigint('generation', { mode: 'number' }).notNull().default(1),
    policy: longtext('policy').notNull(),
    snapshot: longtext('snapshot').notNull(),
    directives: longtext('directives')
      .notNull()
      .default(sql`('[]')`),
    summary: longtext('summary')
      .notNull()
      .default(sql`('')`),
    checks: longtext('checks')
      .notNull()
      .default(sql`('')`),
    sensitive: bigint('sensitive', { mode: 'number' }).notNull().default(0),
    createdBy: varchar('createdBy', { length: 191 }).notNull(),
    approvedBy: varchar('approvedBy', { length: 191 }).notNull().default(''),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
    leaseToken: varchar('leaseToken', { length: 191 }).notNull().default(''),
    leaseUntil: varchar('leaseUntil', { length: 191 }).notNull().default(''),
    controlToken: varchar('controlToken', { length: 191 })
      .notNull()
      .default(''),
    authorization: longtext('authorization')
      .notNull()
      .default(sql`('null')`),
  },
  (t) => [
    uniqueIndex('agent_runs_company_id').on(t.companyId, t.id),
    index('idx_agent_runs_company').on(t.companyId, t.projectId, t.createdAt),
    check(
      'treasure_agent_run_status',
      sql`${t.status} IN ('queued','running','paused','checking','awaiting_review','approved','failed','cancelled')`,
    ),
    check('treasure_agent_run_policy', sql`json_valid(${t.policy})`),
    check('treasure_agent_run_snapshot', sql`json_valid(${t.snapshot})`),
    check('treasure_agent_run_directives', sql`json_valid(${t.directives})`),
    check(
      'treasure_agent_run_authorization',
      sql`json_valid(${t.authorization})`,
    ),
    foreignKey({
      name: 'treasure_agent_runs_companyId_treasure_finance_companies_id_fk',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);
export const agentTasks = mysqlTable(
  'treasure_agent_tasks',
  {
    sortOrder: bigint('sortOrder', { mode: 'number' })
      .autoincrement()
      .notNull()
      .unique(),
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    runId: varchar('runId', { length: 191 }).notNull(),
    spec: longtext('spec').notNull(),
    status: varchar('status', { length: 191 }).notNull().default('pending'),
    content: longtext('content')
      .notNull()
      .default(sql`('')`),
    sources: longtext('sources')
      .notNull()
      .default(sql`('[]')`),
    provider: varchar('provider', { length: 191 }).notNull().default(''),
    inputTokens: bigint('inputTokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('outputTokens', { mode: 'number' })
      .notNull()
      .default(0),
    attempt: bigint('attempt', { mode: 'number' }).notNull().default(0),
    generation: bigint('generation', { mode: 'number' }).notNull().default(1),
    error: longtext('error')
      .notNull()
      .default(sql`('')`),
    startedAt: varchar('startedAt', { length: 191 }).notNull().default(''),
    finishedAt: varchar('finishedAt', { length: 191 }).notNull().default(''),
  },
  (t) => [
    uniqueIndex('agent_tasks_run_id').on(t.runId, t.id),
    index('idx_agent_tasks_run').on(t.companyId, t.runId),
    check('treasure_agent_task_spec', sql`json_valid(${t.spec})`),
    check('treasure_agent_task_sources', sql`json_valid(${t.sources})`),
    foreignKey({
      name: 'treasure_agent_tasks_companyId_runId_treasure_agent_c7f6e7e03d',
      columns: [t.companyId, t.runId],
      foreignColumns: [agentRuns.companyId, agentRuns.id],
    }),
  ],
);
export const agentEvents = mysqlTable(
  'treasure_agent_events',
  {
    seq: bigint('seq', { mode: 'number' }).autoincrement().primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    runId: varchar('runId', { length: 191 }).notNull(),
    taskId: varchar('taskId', { length: 191 }).notNull().default(''),
    generation: bigint('generation', { mode: 'number' }).notNull(),
    type: varchar('type', { length: 191 }).notNull(),
    actor: varchar('actor', { length: 191 }).notNull(),
    content: longtext('content').notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [
    index('idx_agent_events_replay').on(t.companyId, t.runId, t.seq),
    foreignKey({
      name: 'treasure_agent_events_companyId_runId_treasure_agen_cf705cf2dd',
      columns: [t.companyId, t.runId],
      foreignColumns: [agentRuns.companyId, agentRuns.id],
    }),
  ],
);
export const agentSlots = mysqlTable(
  'treasure_agent_slots',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    runId: varchar('runId', { length: 191 }).notNull(),
    token: varchar('token', { length: 191 }).notNull(),
    expiresAt: varchar('expiresAt', { length: 191 }).notNull(),
  },
  (t) => [index('idx_agent_slots_tenant').on(t.companyId, t.expiresAt)],
);
export const tasks = mysqlTable(
  'treasure_tasks',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    title: longtext('title').notNull(),
    type: varchar('type', { length: 191 }).notNull(),
    brief: longtext('brief').notNull(),
    audience: longtext('audience').notNull(),
    channel: varchar('channel', { length: 191 }).notNull(),
    owner: varchar('owner', { length: 191 }).notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    content: longtext('content').notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
    source: longtext('source').notNull(),
    comment: longtext('comment').notNull(),
    dueDate: varchar('dueDate', { length: 191 }).notNull(),
  },
  (t) => [index('idx_tasks_updated').on(t.updatedAt)],
);
export const knowledge = mysqlTable('treasure_knowledge', {
  id: varchar('id', { length: 191 }).primaryKey(),
  title: longtext('title').notNull(),
  category: varchar('category', { length: 191 }).notNull(),
  content: longtext('content').notNull(),
  updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
});
export const flows = mysqlTable('treasure_flows', {
  id: varchar('id', { length: 191 }).primaryKey(),
  title: longtext('title').notNull(),
  description: longtext('description').notNull(),
  type: varchar('type', { length: 191 }).notNull(),
  enabled: boolean('enabled').notNull(),
  runs: bigint('runs', { mode: 'number' }).notNull().default(0),
});
export const activities = mysqlTable(
  'treasure_activities',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    taskId: varchar('taskId', { length: 191 }).notNull(),
    message: longtext('message').notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [index('idx_activities_created').on(t.createdAt)],
);
export const metadata = mysqlTable('treasure_metadata', {
  key: varchar('key', { length: 191 }).primaryKey(),
  value: longtext('value').notNull(),
});
export const financeEntries = mysqlTable(
  'treasure_finance_entries',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    date: varchar('date', { length: 191 }).notNull(),
    direction: varchar('direction', { length: 191 }).notNull(),
    category: varchar('category', { length: 191 }).notNull(),
    counterparty: varchar('counterparty', { length: 191 }).notNull(),
    amountCents: bigint('amountCents', { mode: 'number' }).notNull(),
    taxBps: bigint('taxBps', { mode: 'number' }).notNull(),
    taxCents: bigint('taxCents', { mode: 'number' }).notNull(),
    invoiceNo: varchar('invoiceNo', { length: 191 }).notNull(),
    note: longtext('note').notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
    companyId: varchar('companyId', { length: 191 }).notNull().default('park'),
    accountId: varchar('accountId', { length: 191 }),
    paymentId: varchar('paymentId', { length: 191 }),
    activeInvoiceNo: varchar('activeInvoiceNo', {
      length: 191,
    }).generatedAlwaysAs(
      sql`CASE WHEN invoiceNo<>'' AND status<>'void' AND paymentId IS NULL THEN invoiceNo ELSE NULL END`,
    ),
  },
  (t) => [
    index('idx_finance_date').on(t.date),
    index('idx_finance_company_entries').on(t.companyId, t.date),
    uniqueIndex('idx_finance_payment_entry').on(t.paymentId),
    uniqueIndex('idx_finance_entry_invoice').on(
      t.companyId,
      t.direction,
      t.activeInvoiceNo,
    ),
  ],
);
export const financeCompanies = mysqlTable(
  'treasure_finance_companies',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [uniqueIndex('idx_finance_company_name').on(t.name)],
);
export const financeAccounts = mysqlTable(
  'treasure_finance_accounts',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 191 }).notNull(),
    openingCents: bigint('openingCents', { mode: 'number' }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [uniqueIndex('idx_finance_account_name').on(t.companyId, t.name)],
);
export const financeBills = mysqlTable(
  'treasure_finance_bills',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    kind: varchar('kind', { length: 191 }).notNull(),
    title: longtext('title').notNull(),
    counterparty: varchar('counterparty', { length: 191 }).notNull(),
    category: varchar('category', { length: 191 }).notNull(),
    date: varchar('date', { length: 191 }).notNull(),
    dueDate: varchar('dueDate', { length: 191 }).notNull(),
    amountCents: bigint('amountCents', { mode: 'number' }).notNull(),
    paidCents: bigint('paidCents', { mode: 'number' }).notNull().default(0),
    taxBps: bigint('taxBps', { mode: 'number' }).notNull(),
    invoiceNo: varchar('invoiceNo', { length: 191 }).notNull(),
    note: longtext('note').notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    reviewNote: longtext('reviewNote')
      .notNull()
      .default(sql`('')`),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
    version: varchar('version', { length: 191 }).notNull(),
    activeInvoiceNo: varchar('activeInvoiceNo', {
      length: 191,
    }).generatedAlwaysAs(
      sql`CASE WHEN invoiceNo<>'' AND status<>'void' THEN invoiceNo ELSE NULL END`,
    ),
  },
  (t) => [
    index('idx_finance_company_bills').on(t.companyId, t.date),
    uniqueIndex('idx_finance_bill_invoice').on(
      t.companyId,
      t.kind,
      t.activeInvoiceNo,
    ),
  ],
);
export const financePayments = mysqlTable(
  'treasure_finance_payments',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    billId: varchar('billId', { length: 191 }).notNull(),
    accountId: varchar('accountId', { length: 191 }).notNull(),
    amountCents: bigint('amountCents', { mode: 'number' }).notNull(),
    date: varchar('date', { length: 191 }).notNull(),
    reference: varchar('reference', { length: 191 }).notNull(),
    note: longtext('note').notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [index('idx_finance_company_payments').on(t.companyId, t.date)],
);
export const financeAudit = mysqlTable('treasure_finance_audit', {
  id: varchar('id', { length: 191 }).primaryKey(),
  companyId: varchar('companyId', { length: 191 }).notNull(),
  billId: varchar('billId', { length: 191 }).notNull(),
  message: longtext('message').notNull(),
  createdAt: varchar('createdAt', { length: 191 }).notNull(),
});
export const financeDocuments = mysqlTable('treasure_finance_documents', {
  billId: varchar('billId', { length: 191 }).primaryKey(),
  companyId: varchar('companyId', { length: 191 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  mime: varchar('mime', { length: 191 }).notNull(),
  data: longtext('data').notNull(),
});
export const taxInvoices = mysqlTable(
  'treasure_tax_invoices',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    direction: varchar('direction', { length: 191 }).notNull(),
    polarity: varchar('polarity', { length: 191 }).notNull(),
    type: varchar('type', { length: 191 }).notNull(),
    invoiceNo: varchar('invoiceNo', { length: 191 }).notNull(),
    originalInvoiceNo: varchar('originalInvoiceNo', { length: 191 })
      .notNull()
      .default(''),
    counterparty: varchar('counterparty', { length: 191 }).notNull(),
    date: varchar('date', { length: 191 }).notNull(),
    amountCents: bigint('amountCents', { mode: 'number' }).notNull(),
    taxCents: bigint('taxCents', { mode: 'number' }).notNull(),
    deduction: varchar('deduction', { length: 191 })
      .notNull()
      .default('pending'),
    status: varchar('status', { length: 191 }).notNull(),
    reviewer: varchar('reviewer', { length: 191 }).notNull().default(''),
    note: longtext('note').notNull(),
    sourceId: varchar('sourceId', { length: 191 }).notNull().default(''),
    version: varchar('version', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
    activeInvoiceNo: varchar('activeInvoiceNo', {
      length: 191,
    }).generatedAlwaysAs(
      sql`CASE WHEN status<>'void' THEN invoiceNo ELSE NULL END`,
    ),
    activeSourceId: varchar('activeSourceId', {
      length: 191,
    }).generatedAlwaysAs(
      sql`CASE WHEN sourceId<>'' AND status<>'void' THEN sourceId ELSE NULL END`,
    ),
  },
  (t) => [
    index('idx_tax_invoice_date').on(t.companyId, t.date),
    uniqueIndex('idx_tax_invoice_number').on(
      t.companyId,
      t.direction,
      t.activeInvoiceNo,
    ),
    uniqueIndex('idx_tax_invoice_source').on(t.companyId, t.activeSourceId),
  ],
);
export const taxFilings = mysqlTable(
  'treasure_tax_filings',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    taxType: varchar('taxType', { length: 191 }).notNull(),
    periodStart: varchar('periodStart', { length: 191 }).notNull(),
    periodEnd: varchar('periodEnd', { length: 191 }).notNull(),
    deadline: varchar('deadline', { length: 191 }).notNull(),
    owner: varchar('owner', { length: 191 }).notNull(),
    amountCents: bigint('amountCents', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    filingNo: varchar('filingNo', { length: 191 }).notNull().default(''),
    filedDate: varchar('filedDate', { length: 191 }).notNull().default(''),
    paymentReference: varchar('paymentReference', { length: 191 })
      .notNull()
      .default(''),
    paidDate: varchar('paidDate', { length: 191 }).notNull().default(''),
    note: longtext('note').notNull(),
    version: varchar('version', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
    activeRecord: bigint('activeRecord', { mode: 'number' }).generatedAlwaysAs(
      sql`CASE WHEN status<>'void' THEN 1 ELSE NULL END`,
    ),
  },
  (t) => [
    index('idx_tax_filing_due').on(t.companyId, t.deadline),
    uniqueIndex('idx_tax_filing_period').on(
      t.companyId,
      t.taxType,
      t.periodStart,
      t.periodEnd,
      t.activeRecord,
    ),
  ],
);
export const taxDocuments = mysqlTable('treasure_tax_documents', {
  invoiceId: varchar('invoiceId', { length: 191 }).primaryKey(),
  companyId: varchar('companyId', { length: 191 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  mime: varchar('mime', { length: 191 }).notNull(),
  data: longtext('data').notNull(),
});
export const serviceTickets = mysqlTable(
  'treasure_service_tickets',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    title: longtext('title').notNull(),
    location: varchar('location', { length: 191 }).notNull(),
    category: varchar('category', { length: 191 }).notNull(),
    priority: varchar('priority', { length: 191 }).notNull(),
    reporter: varchar('reporter', { length: 191 }).notNull(),
    description: longtext('description').notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [index('idx_service_tickets_created').on(t.createdAt)],
);

export const platformUsers = mysqlTable('treasure_platform_users', {
  id: varchar('id', { length: 191 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  salt: varchar('salt', { length: 191 }).notNull(),
  passwordHash: varchar('passwordHash', { length: 191 }).notNull(),
  isAdmin: bigint('isAdmin', { mode: 'number' }).notNull().default(0),
  active: bigint('active', { mode: 'number' }).notNull().default(1),
  createdAt: varchar('createdAt', { length: 191 }).notNull(),
});
export const platformMembers = mysqlTable(
  'treasure_platform_members',
  {
    userId: varchar('userId', { length: 191 }).notNull(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    role: varchar('role', { length: 191 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    check(
      'treasure_platform_role_check',
      sql`${t.role} IN ('admin','manager','member','viewer')`,
    ),
    foreignKey({
      name: 'treasure_platform_members_userId_treasure_platform_users_id_fk',
      columns: [t.userId],
      foreignColumns: [platformUsers.id],
    }),
    foreignKey({
      name: 'treasure_platform_members_companyId_treasure_financ_cf5a542883',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);
export const platformSessions = mysqlTable(
  'treasure_platform_sessions',
  {
    tokenHash: varchar('tokenHash', { length: 191 }).primaryKey(),
    userId: varchar('userId', { length: 191 }).notNull(),
    expiresAt: varchar('expiresAt', { length: 191 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'treasure_platform_sessions_userId_treasure_platform_users_id_fk',
      columns: [t.userId],
      foreignColumns: [platformUsers.id],
    }),
  ],
);
export const platformLoginAttempts = mysqlTable(
  'treasure_platform_login_attempts',
  {
    key: varchar('key', { length: 191 }).primaryKey(),
    attempts: bigint('attempts', { mode: 'number' }).notNull(),
    expiresAt: varchar('expiresAt', { length: 191 }).notNull(),
  },
);
export const businessRecords = mysqlTable(
  'treasure_business_records',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    kind: varchar('kind', { length: 191 }).notNull(),
    title: longtext('title').notNull(),
    owner: varchar('owner', { length: 191 }).notNull(),
    dueDate: varchar('dueDate', { length: 191 }).notNull().default(''),
    status: varchar('status', { length: 191 }).notNull(),
    data: longtext('data').notNull(),
    version: varchar('version', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
    meterSerial: varchar('meterSerial', { length: 191 }).generatedAlwaysAs(
      sql`CASE WHEN kind='meter' AND JSON_TYPE(JSON_EXTRACT(data,'$.serial'))<>'NULL' THEN JSON_UNQUOTE(JSON_EXTRACT(data,'$.serial')) ELSE NULL END`,
    ),
  },
  (t) => [
    uniqueIndex('business_tenant_id').on(t.companyId, t.id),
    index('idx_business_tenant_kind').on(t.companyId, t.kind, t.updatedAt),
    index('idx_business_due').on(t.companyId, t.dueDate, t.status),
    uniqueIndex('idx_meter_serial').on(t.companyId, t.meterSerial),
    check('treasure_business_data_json', sql`json_valid(${t.data})`),
    foreignKey({
      name: 'treasure_business_records_companyId_treasure_financ_45f17088cd',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);
export const businessRelations = mysqlTable(
  'treasure_business_relations',
  {
    companyId: varchar('companyId', { length: 191 }).notNull(),
    recordId: varchar('recordId', { length: 191 }).notNull(),
    field: varchar('field', { length: 191 }).notNull(),
    targetId: varchar('targetId', { length: 191 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.field] }),
    foreignKey({
      name: 'treasure_business_relations_companyId_recordId_con_202057cef7',
      columns: [t.companyId, t.recordId],
      foreignColumns: [businessRecords.companyId, businessRecords.id],
    }),
    foreignKey({
      name: 'treasure_business_relations_companyId_targetId_con_d56cd12b70',
      columns: [t.companyId, t.targetId],
      foreignColumns: [businessRecords.companyId, businessRecords.id],
    }),
  ],
);
export const businessHistory = mysqlTable(
  'treasure_business_history',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    recordId: varchar('recordId', { length: 191 }).notNull(),
    actorId: varchar('actorId', { length: 191 }).notNull(),
    actorName: varchar('actorName', { length: 191 }).notNull(),
    action: varchar('action', { length: 191 }).notNull(),
    snapshot: longtext('snapshot').notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [
    index('idx_business_history').on(t.companyId, t.recordId, t.createdAt),
    check('treasure_business_snapshot_json', sql`json_valid(${t.snapshot})`),
  ],
);
export const businessAutomations = mysqlTable(
  'treasure_business_automations',
  {
    companyId: varchar('companyId', { length: 191 }).notNull(),
    sourceId: varchar('sourceId', { length: 191 }).notNull(),
    action: varchar('action', { length: 191 }).notNull(),
    targetId: varchar('targetId', { length: 191 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.action] })],
);
export const businessFiles = mysqlTable(
  'treasure_business_files',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    recordId: varchar('recordId', { length: 191 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    mime: varchar('mime', { length: 191 }).notNull(),
    data: longtext('data').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'treasure_business_files_companyId_recordId_treasure_7720052b46',
      columns: [t.companyId, t.recordId],
      foreignColumns: [businessRecords.companyId, businessRecords.id],
    }),
  ],
);
export const businessAiSteps = mysqlTable(
  'treasure_business_ai_steps',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    runId: varchar('runId', { length: 191 }).notNull(),
    step: bigint('step', { mode: 'number' }).notNull(),
    roleId: varchar('roleId', { length: 191 }).notNull(),
    content: longtext('content').notNull(),
    sources: longtext('sources').notNull(),
    provider: varchar('provider', { length: 191 }).notNull(),
    inputTokens: bigint('inputTokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('outputTokens', { mode: 'number' })
      .notNull()
      .default(0),
    status: varchar('status', { length: 191 }).notNull(),
    version: varchar('version', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [
    uniqueIndex('business_ai_step_unique').on(t.runId, t.step),
    foreignKey({
      name: 'treasure_business_ai_steps_companyId_runId_treasure_839c31f05d',
      columns: [t.companyId, t.runId],
      foreignColumns: [businessRecords.companyId, businessRecords.id],
    }),
  ],
);
export const businessNoticeInbox = mysqlTable(
  'treasure_business_notice_inbox',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    noticeId: varchar('noticeId', { length: 191 }).notNull(),
    senderCompanyId: varchar('senderCompanyId', { length: 191 }).notNull(),
    title: longtext('title').notNull(),
    content: longtext('content').notNull(),
    status: varchar('status', { length: 191 }).notNull().default('未读'),
    response: varchar('response', { length: 191 }).notNull().default(''),
    version: varchar('version', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [uniqueIndex('business_inbox_unique').on(t.companyId, t.noticeId)],
);
export const businessAiLocks = mysqlTable('treasure_business_ai_locks', {
  runId: varchar('runId', { length: 191 }).primaryKey(),
  token: varchar('token', { length: 191 }).notNull(),
  expiresAt: varchar('expiresAt', { length: 191 }).notNull(),
});
export const businessImportBatches = mysqlTable(
  'treasure_business_import_batches',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    kind: varchar('kind', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
);

export const integrationConnections = mysqlTable(
  'treasure_integration_connections',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    provider: varchar('provider', { length: 191 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    config: longtext('config').notNull(),
    enabled: bigint('enabled', { mode: 'number' }).notNull().default(0),
    testStatus: varchar('testStatus', { length: 191 })
      .notNull()
      .default('not_tested'),
    testMessage: longtext('testMessage')
      .notNull()
      .default(sql`('')`),
    version: varchar('version', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [
    index('idx_connections_company').on(t.companyId, t.provider),
    check('treasure_integration_config_json', sql`json_valid(${t.config})`),
    foreignKey({
      name: 'treasure_integration_connections_companyId_treasure_8d33347df6',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);
export const integrationSecrets = mysqlTable(
  'treasure_integration_secrets',
  {
    connectionId: varchar('connectionId', { length: 191 }).notNull(),
    field: varchar('field', { length: 191 }).notNull(),
    nonce: varchar('nonce', { length: 191 }).notNull(),
    ciphertext: longtext('ciphertext').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.connectionId, t.field] }),
    foreignKey({
      name: 'treasure_integration_secrets_connectionId_treasure__8b4b0a5c2b',
      columns: [t.connectionId],
      foreignColumns: [integrationConnections.id],
    }),
  ],
);
export const integrationJobs = mysqlTable(
  'treasure_integration_jobs',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    connectionId: varchar('connectionId', { length: 191 }).notNull(),
    recordId: varchar('recordId', { length: 191 }).notNull(),
    recordVersion: varchar('recordVersion', { length: 191 }).notNull(),
    kind: varchar('kind', { length: 191 }).notNull(),
    title: longtext('title').notNull(),
    status: varchar('status', { length: 191 }).notNull(),
    payload: longtext('payload').notNull(),
    result: longtext('result').notNull(),
    attempts: bigint('attempts', { mode: 'number' }).notNull().default(0),
    maxAttempts: bigint('maxAttempts', { mode: 'number' }).notNull().default(3),
    nextRetryAt: varchar('nextRetryAt', { length: 191 }).notNull().default(''),
    remoteId: varchar('remoteId', { length: 191 }).notNull().default(''),
    version: varchar('version', { length: 191 }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [
    index('idx_jobs_company').on(t.companyId, t.status, t.updatedAt),
    check('treasure_integration_payload_json', sql`json_valid(${t.payload})`),
    check('treasure_integration_result_json', sql`json_valid(${t.result})`),
    foreignKey({
      name: 'treasure_integration_jobs_connectionId_treasure_int_a2421b6276',
      columns: [t.connectionId],
      foreignColumns: [integrationConnections.id],
    }),
    foreignKey({
      name: 'treasure_integration_jobs_companyId_recordId_conso_ff1776e889',
      columns: [t.companyId, t.recordId],
      foreignColumns: [businessRecords.companyId, businessRecords.id],
    }),
  ],
);
export const integrationEvents = mysqlTable('treasure_integration_events', {
  id: varchar('id', { length: 191 }).primaryKey(),
  companyId: varchar('companyId', { length: 191 }).notNull(),
  connectionId: varchar('connectionId', { length: 191 }).notNull(),
  jobId: varchar('jobId', { length: 191 }).notNull().default(''),
  actor: varchar('actor', { length: 191 }).notNull(),
  message: longtext('message').notNull(),
  createdAt: varchar('createdAt', { length: 191 }).notNull(),
});
export const integrationCallbacks = mysqlTable(
  'treasure_integration_callbacks',
  {
    connectionId: varchar('connectionId', { length: 191 }).notNull(),
    eventId: varchar('eventId', { length: 191 }).notNull(),
    payloadHash: varchar('payloadHash', { length: 191 }).notNull(),
    receivedAt: varchar('receivedAt', { length: 191 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.eventId] })],
);
export const businessFileChunks = mysqlTable(
  'treasure_business_file_chunks',
  {
    fileId: varchar('fileId', { length: 191 }).notNull(),
    part: bigint('part', { mode: 'number' }).notNull(),
    data: longtext('data').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fileId, t.part] }),
    foreignKey({
      name: 'treasure_business_file_chunks_fileId_treasure_bus_311b998880',
      columns: [t.fileId],
      foreignColumns: [businessFiles.id],
    }),
  ],
);
export const integrationUsage = mysqlTable('treasure_integration_usage', {
  id: varchar('id', { length: 191 }).primaryKey(),
  companyId: varchar('companyId', { length: 191 }).notNull(),
  recordId: varchar('recordId', { length: 191 }).notNull(),
  connectionId: varchar('connectionId', { length: 191 }).notNull(),
  model: varchar('model', { length: 191 }).notNull(),
  inputTokens: bigint('inputTokens', { mode: 'number' }).notNull(),
  outputTokens: bigint('outputTokens', { mode: 'number' }).notNull(),
  createdAt: varchar('createdAt', { length: 191 }).notNull(),
});
export const knowledgeImports = mysqlTable(
  'treasure_knowledge_imports',
  {
    companyId: varchar('companyId', { length: 191 }).notNull(),
    hash: varchar('hash', { length: 191 }).notNull(),
    recordId: varchar('recordId', { length: 191 }).notNull(),
    count: bigint('count', { mode: 'number' }).notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.hash] })],
);
export const pptWorkspaces = mysqlTable(
  'treasure_ppt_workspaces',
  {
    companyId: varchar('companyId', { length: 191 }).primaryKey().notNull(),
    state: longtext('state').notNull(),
    version: varchar('version', { length: 191 }).notNull(),
    updatedAt: varchar('updatedAt', { length: 191 }).notNull(),
  },
  (t) => [
    check('treasure_ppt_state_json', sql`json_valid(${t.state})`),
    foreignKey({
      name: 'treasure_ppt_workspaces_companyId_treasure_financ_2a8bd92d43',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);
export const pptFiles = mysqlTable(
  'treasure_ppt_files',
  {
    id: varchar('id', { length: 191 }).primaryKey().notNull(),
    companyId: varchar('companyId', { length: 191 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    mime: varchar('mime', { length: 191 }).notNull(),
    data: longtext('data').notNull(),
    createdAt: varchar('createdAt', { length: 191 }).notNull(),
  },
  (t) => [
    index('idx_ppt_files_company').on(t.companyId),
    foreignKey({
      name: 'treasure_ppt_files_companyId_treasure_finance_companies_id_fk',
      columns: [t.companyId],
      foreignColumns: [financeCompanies.id],
    }),
  ],
);
