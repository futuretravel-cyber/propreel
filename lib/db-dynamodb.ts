/**
 * DynamoDB driver (default) — see lib/db.ts for the driver dispatcher and
 * lib/db-supabase.ts for the Supabase twin (DB_DRIVER=supabase).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

export const dbDriver = 'dynamodb' as const;

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
  const setExpressions: string[] = [];
  const removeExpressions: string[] = [];
  const expressionAttributeValues: Record<string, any> = {};
  const expressionAttributeNames: Record<string, string> = {};

  // Fields explicitly set to undefined are REMOVEd from the item (used to
  // clear dunning state etc.), rather than silently dropped or written as
  // DynamoDB NULL. Also ensures at least one update action always exists.
  let i = 0;
  for (const [field, value] of Object.entries(updates)) {
    const placeholder = `#field${i}`;
    expressionAttributeNames[placeholder] = field;
    if (value === undefined) {
      removeExpressions.push(placeholder);
    } else {
      setExpressions.push(`${placeholder} = :val${i}`);
      expressionAttributeValues[`\u003aval${i}`] = value;
    }
    i++;
  }

  if (setExpressions.length === 0 && removeExpressions.length === 0) return;

  const actions: string[] = [];
  if (setExpressions.length) actions.push(`SET ${setExpressions.join(', ')}`);
  if (removeExpressions.length) actions.push(`REMOVE ${removeExpressions.join(', ')}`);

  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: actions.join(' '),
    ExpressionAttributeNames: expressionAttributeNames,
    ...(Object.keys(expressionAttributeValues).length > 0 ? { ExpressionAttributeValues: expressionAttributeValues } : {}),
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

export async function deleteItem(tableName: string, key: Record<string, any>): Promise<void> {
  await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
}

/** Atomic put-if-absent (idempotency locks). Returns true when claimed. */
export async function putItemIfNotExists(tableName: string, item: Record<string, any>): Promise<boolean> {
  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/** Atomic conditional decrement over a top-level numeric attribute.
 *  Returns the new value, or null when the row is missing/insufficient. */
export async function decrementIfEnough(
  tableName: string,
  key: Record<string, any>,
  attr: string,
  amount: number
): Promise<number | null> {
  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET #attr = #attr - :amount, updatedAt = :now`,
      ConditionExpression: 'attribute_exists(id) AND #attr >= :amount',
      ExpressionAttributeNames: { '#attr': attr },
      ExpressionAttributeValues: { ':amount': amount, ':now': new Date().toISOString() },
      ReturnValues: 'UPDATED_NEW',
    }));
    return Number(result.Attributes?.[attr] ?? null);
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return null;
    throw err;
  }
}

/** Atomic increment that creates the attribute when missing. */
export async function incrementValue(
  tableName: string,
  key: Record<string, any>,
  attr: string,
  amount: number
): Promise<number> {
  const result = await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: `SET #attr = if_not_exists(#attr, :zero) + :amount, updatedAt = :now`,
    ConditionExpression: 'attribute_exists(id)',
    ExpressionAttributeNames: { '#attr': attr },
    ExpressionAttributeValues: { ':zero': 0, ':amount': amount, ':now': new Date().toISOString() },
    ReturnValues: 'UPDATED_NEW',
  }));
  return Number(result.Attributes?.[attr] ?? 0);
}

/** Conditional update for atomic claims: succeeds only when every
 *  attrNotExists attribute is absent and every attrEquals matches. */
export async function updateWhere(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>,
  opts: { attrNotExists?: string[]; attrEquals?: Record<string, any> } = {}
): Promise<boolean> {
  const names: Record<string, string> = {};
  const values: Record<string, any> = { ':now': new Date().toISOString() };
  const setExprs: string[] = [];
  const conds: string[] = ['attribute_exists(id)'];
  let i = 0;
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    names[`#s${i}`] = k;
    setExprs.push(`#s${i} = :v${i}`);
    values[`:v${i}`] = v;
    i++;
  }
  for (const attr of opts.attrNotExists ?? []) {
    names[`#n${i}`] = attr;
    conds.push(`attribute_not_exists(#n${i})`);
    i++;
  }
  for (const [attr, v] of Object.entries(opts.attrEquals ?? {})) {
    names[`#e${i}`] = attr;
    values[`:e${i}`] = v;
    conds.push(`#e${i} = :e${i}`);
    i++;
  }
  if (setExprs.length === 0) setExprs.push('updatedAt = :now');
  try {
    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${setExprs.join(', ')}`,
      ConditionExpression: conds.join(' AND '),
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
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
