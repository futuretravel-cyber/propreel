/**
 * AWS DynamoDB Client
 * Replaces Supabase Postgres for main data storage
 * Supabase is only used for Google OAuth authentication
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_PREFIX = 'propreel-';

export const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'af-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    // Items may carry optional fields (e.g. paystackSubscriptionCode) that are
    // undefined at runtime; without this the SDK throws on marshall.
    removeUndefinedValues: true,
  },
});

// Table names
export const TABLES = {
  USERS: `${TABLE_PREFIX}users`,
  CREDIT_TRANSACTIONS: `${TABLE_PREFIX}credit_transactions`,
  SUBSCRIPTIONS: `${TABLE_PREFIX}subscriptions`,
  CREDIT_EXPIRIES: `${TABLE_PREFIX}credit_expiries`,
  AGENCIES: `${TABLE_PREFIX}agencies`,
  AGENCY_MEMBERS: `${TABLE_PREFIX}agency_members`,
  REVIEWS: `${TABLE_PREFIX}reviews`,
  PROJECTS: `${TABLE_PREFIX}projects`,
  SETTINGS: `${TABLE_PREFIX}settings`,
};

// Generic CRUD helpers
export async function getItem<T>(tableName: string, key: Record<string, any>): Promise<T | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: key,
    }));
    return (result.Item as T) || null;
  } catch (error) {
    console.error(`DynamoDB GetItem error on ${tableName}:`, error);
    return null;
  }
}

export async function putItem(tableName: string, item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));
}

export async function updateItem(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>
): Promise<void> {
  const updateExpressions: string[] = [];
  const expressionAttributeValues: Record<string, any> = {};
  const expressionAttributeNames: Record<string, string> = {};

  let i = 0;
  for (const [field, value] of Object.entries(updates)) {
    const placeholder = `#field${i}`;
    const valuePlaceholder = `:val${i}`;
    updateExpressions.push(`${placeholder} = ${valuePlaceholder}`);
    expressionAttributeNames[placeholder] = field;
    expressionAttributeValues[valuePlaceholder] = value;
    i++;
  }

  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }));
}

export async function queryItems<T>(tableName: string, keyCondition: any, options?: { filter?: any; limit?: number; scanIndexForward?: boolean }): Promise<T[]> {
  const params: any = {
    TableName: tableName,
    KeyConditionExpression: keyCondition.expression,
    ExpressionAttributeValues: keyCondition.values || {},
  };

  // DynamoDB REJECTS empty ExpressionAttributeNames/Values maps
  // ("must not be empty") — only include them when non-empty, otherwise
  // every names-less query silently returned [] via the catch below.
  const names = keyCondition.names || {};
  if (Object.keys(names).length > 0) {
    params.ExpressionAttributeNames = { ...names };
  }

  if (options?.filter) {
    params.FilterExpression = options.filter.expression;
    if (options.filter.names) {
      params.ExpressionAttributeNames = { ...params.ExpressionAttributeNames, ...options.filter.names };
    }
    if (options.filter.values) {
      params.ExpressionAttributeValues = { ...params.ExpressionAttributeValues, ...options.filter.values };
    }
    if (Object.keys(params.ExpressionAttributeValues).length === 0) {
      delete params.ExpressionAttributeValues;
    }
  } else if (Object.keys(params.ExpressionAttributeValues).length === 0) {
    delete params.ExpressionAttributeValues;
  }

  if (options?.limit) {
    params.Limit = options.limit;
  }

  if (options?.scanIndexForward !== undefined) {
    params.ScanIndexForward = options.scanIndexForward;
  }

  try {
    const result = await docClient.send(new QueryCommand(params));
    return (result.Items as T[]) || [];
  } catch (error) {
    console.error(`DynamoDB Query error on ${tableName}:`, error);
    return [];
  }
}

export async function scanItems<T>(tableName: string, options?: { filter?: any; limit?: number }): Promise<T[]> {
  const params: any = {
    TableName: tableName,
  };

  if (options?.limit) {
    params.Limit = options.limit;
  }

  if (options?.filter) {
    params.FilterExpression = options.filter.expression;
    if (options.filter.names) {
      params.ExpressionAttributeNames = options.filter.names;
    }
    if (options.filter.values) {
      params.ExpressionAttributeValues = options.filter.values;
    }
  }

  try {
    const result = await docClient.send(new ScanCommand(params));
    return (result.Items as T[]) || [];
  } catch (error) {
    console.error(`DynamoDB Scan error on ${tableName}:`, error);
    return [];
  }
}

export async function transactWriteItems(transactions: Array<{ table: string; operation: 'put' | 'update' | 'delete'; item?: any; key?: any; updates?: any }>): Promise<void> {
  // DynamoDB transactWrite is more complex - for simplicity we'll do sequential writes
  // In production, use aws-sdk's TransactWriteItemsCommand
  for (const tx of transactions) {
    if (tx.operation === 'put' && tx.item) {
      await putItem(tx.table, tx.item);
    } else if (tx.operation === 'update' && tx.key && tx.updates) {
      await updateItem(tx.table, tx.key, tx.updates);
    }
  }
}
