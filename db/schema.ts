import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const settings=sqliteTable('settings',{id:text('id').primaryKey(),value:text('value').notNull()});
export const records=sqliteTable('records',{key:text('key').primaryKey(),generation:text('generation').notNull(),kind:text('kind').notNull(),id:text('id').notNull(),data:text('data').notNull()},t=>[index('records_generation_kind').on(t.generation,t.kind)]);
export const events=sqliteTable('events',{id:text('id').primaryKey(),createdAt:text('created_at').notNull()});
export const messages=sqliteTable('messages',{id:text('id').primaryKey(),customer:text('customer').notNull(),state:text('state').notNull(),createdAt:text('created_at').notNull()});
export const sessions=sqliteTable('sessions',{id:text('id').primaryKey(),platformUser:text('platform_user').notNull(),expiresAt:integer('expires_at').notNull()});
export const loginAttempts=sqliteTable('login_attempts',{id:text('id').primaryKey(),attempts:integer('attempts').notNull(),windowStart:integer('window_start').notNull()});
export const contacts=sqliteTable('contacts',{id:text('id').primaryKey(),customer:text('customer').notNull(),kind:text('kind').notNull(),note:text('note').notNull(),createdAt:text('created_at').notNull()},t=>[index('contacts_customer_date').on(t.customer,t.createdAt)]);
