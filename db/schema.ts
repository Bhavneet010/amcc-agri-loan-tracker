// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const branches = sqliteTable('branches', {
  id: text('id').primaryKey(), name: text('name').notNull(), version: integer('version').notNull().default(1),
}, t => [uniqueIndex('branch_name_unique').on(t.name)]);
export const loans = sqliteTable('loans', {
  id: text('id').primaryKey(), branchId: text('branch_id').notNull().references(() => branches.id),
  category: text('category').notNull(), atsId: text('ats_id').notNull(), amountPaise: integer('amount_paise').notNull(),
  status: text('status').notNull().default('pending'), remarks: text('remarks').notNull().default(''),
  compliance: text('compliance').notNull().default('none'), version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('loan_ats_unique').on(t.branchId, t.category, t.atsId)]);
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), loanId: text('loan_id').notNull(), actor: text('actor').notNull(),
  changes: text('changes').notNull(), createdAt: text('created_at').notNull(),
});
export const loginAttempts = sqliteTable('login_attempts', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull().default(0), windowStart: integer('window_start').notNull(),
});
