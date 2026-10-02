/**
 * Database driver dispatcher.
 *
 * Every caller imports from './db' and gets the active driver's
 * implementation of the same helper interface:
 *   getItem, putItem, updateItem, queryItems, scanItems, deleteItem,
 *   transactWriteItems, putItemIfNotExists, decrementIfEnough,
 *   incrementValue, updateWhere, TABLES
 *
 *   DB_DRIVER=dynamodb (default) → lib/db-dynamodb.ts  (AWS DynamoDB)
 *   DB_DRIVER=supabase           → lib/db-supabase.ts  (Supabase Postgres)
 *
 * The Supabase schema lives in supabase/schema.sql; migration steps in
 * docs/SUPABASE_MIGRATION.md. Atomic guarantees (balance decrements,
 * idempotency locks) are implemented natively by BOTH drivers, so the
 * credit system behaves identically on either backend.
 */

import * as dynamodb from './db-dynamodb';
import * as supabase from './db-supabase';

const driver = process.env.DB_DRIVER === 'supabase' ? supabase : dynamodb;

export const dbDriver = driver.dbDriver;
export const TABLES = driver.TABLES;
export const getItem = driver.getItem;
export const putItem = driver.putItem;
export const putItemIfNotExists = driver.putItemIfNotExists;
export const updateItem = driver.updateItem;
export const queryItems = driver.queryItems;
export const scanItems = driver.scanItems;
export const deleteItem = driver.deleteItem;
export const transactWriteItems = driver.transactWriteItems;
export const decrementIfEnough = driver.decrementIfEnough;
export const incrementValue = driver.incrementValue;
export const updateWhere = driver.updateWhere;

/** Legacy raw escape hatch — DynamoDB only. New code must use the helpers
 *  above so it works on both drivers. */
export const docClient = dynamodb.docClient;
export { ddbClient } from './db-dynamodb';
