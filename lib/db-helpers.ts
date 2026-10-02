/**
 * DynamoDB Helper Utilities
 * Common operations for working with DynamoDB tables
 */

import { docClient, queryItems, scanItems, putItem, updateItem, getItem, TABLES } from './db';

export interface PaginatedResult<T> {
  items: T[];
  nextKey?: Record<string, any>;
  total?: number;
}

// Query with pagination
export async function queryWithPagination<T>(
  tableName: string,
  keyCondition: any,
  options?: { limit?: number; startKey?: Record<string, any>; scanIndexForward?: boolean }
): Promise<PaginatedResult<T>> {
  const params: any = {
    TableName: tableName,
    KeyConditionExpression: keyCondition.expression,
    ExpressionAttributeNames: keyCondition.names || {},
    ExpressionAttributeValues: keyCondition.values || {},
  };

  if (options?.limit) {
    params.Limit = options.limit;
  }

  if (options?.scanIndexForward !== undefined) {
    params.ScanIndexForward = options.scanIndexForward;
  }

  if (options?.startKey) {
    params.ExclusiveStartKey = options.startKey;
  }

  try {
    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await docClient.send(new QueryCommand(params));
    return {
      items: (result.Items as T[]) || [],
      nextKey: result.LastEvaluatedKey as Record<string, any> | undefined,
    };
  } catch (error) {
    console.error(`Query error on ${tableName}:`, error);
    return { items: [] };
  }
}

// Get user by email (scan with filter for small tables)
export async function findUserByEmail(email: string) {
  const results = await scanItems<any>(TABLES.USERS, {
    filter: {
      expression: 'email = :email',
      values: { ':email': email.toLowerCase() },
    },
    limit: 1,
  });
  return results[0] || null;
}

// Get user by Supabase user ID (users table has no GSI on supabaseUserId,
// so we scan with a filter)
export async function findUserBySupabaseId(supabaseUserId: string) {
  const results = await scanItems<any>(TABLES.USERS, {
    filter: {
      expression: 'supabaseUserId = :sid',
      values: { ':sid': supabaseUserId },
    },
    limit: 1,
  });
  return results[0] || null;
}

// Batch write items (for bulk operations)
export async function batchWriteItems(
  items: Array<{ table: string; item: Record<string, any> }>,
  batchSize = 25
): Promise<{ successful: number; failed: number }> {
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // DynamoDB batchWrite can handle up to 25 items per request
    // For simplicity, we'll do sequential writes
    for (const { table, item } of batch) {
      try {
        await putItem(table, item);
        successful++;
      } catch (error) {
        console.error(`Failed to write item to ${table}:`, error);
        failed++;
      }
    }
  }

  return { successful, failed };
}

// Delete item (delegates to the active driver)
export async function deleteItem(tableName: string, key: Record<string, any>): Promise<boolean> {
  try {
    const { deleteItem: del } = await import('./db');
    await del(tableName, key);
    return true;
  } catch (error) {
    console.error(`Delete error on ${tableName}:`, error);
    return false;
  }
}

// Check if item exists
export async function itemExists(tableName: string, key: Record<string, any>): Promise<boolean> {
  const item = await getItem(tableName, key);
  return item !== null;
}

// Generate unique ID
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Convert ISO date to sortable string (for use as sort key)
export function toSortableDate(date: Date): string {
  return date.toISOString();
}

// Parse sortable date back to Date
export function fromSortableDate(dateStr: string): Date {
  return new Date(dateStr);
}
