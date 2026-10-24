/**
 * Database access layer — AWS DynamoDB is the ONLY backend.
 *
 * Every caller imports from './db' and gets the DynamoDB implementation of
 * the shared helper interface:
 *   getItem, putItem, updateItem, queryItems, scanItems, deleteItem,
 *   transactWriteItems, putItemIfNotExists, decrementIfEnough,
 *   incrementValue, updateWhere, TABLES
 *
 * (Historically this file dispatched on DB_DRIVER between DynamoDB and
 * Supabase. Supabase was fully removed on 3 Oct 2026 — all production data
 * lives in AWS DynamoDB, af-south-1.)
 */

import * as dynamodb from './db-dynamodb';

export const dbDriver = dynamodb.dbDriver;
export const TABLES = dynamodb.TABLES;
export const getItem = dynamodb.getItem;
export const putItem = dynamodb.putItem;
export const putItemIfNotExists = dynamodb.putItemIfNotExists;
export const updateItem = dynamodb.updateItem;
export const queryItems = dynamodb.queryItems;
export const queryIndex = dynamodb.queryIndex;
export const scanItems = dynamodb.scanItems;
export const scanAll = dynamodb.scanAll;
export const deleteItem = dynamodb.deleteItem;
export const transactWriteItems = dynamodb.transactWriteItems;
export const decrementIfEnough = dynamodb.decrementIfEnough;
export const incrementValue = dynamodb.incrementValue;
export const updateWhere = dynamodb.updateWhere;

/** Legacy raw escape hatch (DynamoDB DocumentClient). */
export const docClient = dynamodb.docClient;
export { ddbClient } from './db-dynamodb';
