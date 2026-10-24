/**
 * DynamoDB Table Creation Script
 * Run this once to create all required tables for PropReel
 *
 * Usage:
 *   npm run create-tables
 *
 * Requirements:
 *   - AWS credentials configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 *   - AWS_REGION set in .env
 */

import { DynamoDBClient, CreateTableCommand, UpdateTableCommand, DescribeTableCommand, waitUntilTableExists, ScalarAttributeType, KeyType } from '@aws-sdk/client-dynamodb';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const region = process.env.AWS_REGION || 'af-south-1';
const client = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const TABLES = [
  {
    name: 'propreel-users',
    attributes: [
      { name: 'id', type: 'S' },
    ],
    keySchema: [
      { name: 'id', keyType: 'HASH' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-credit_transactions',
    attributes: [
      { name: 'userId', type: 'S' },
      { name: 'createdAt', type: 'S' },
    ],
    keySchema: [
      { name: 'userId', keyType: 'HASH' },
      { name: 'createdAt', keyType: 'RANGE' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-subscriptions',
    attributes: [
      { name: 'userId', type: 'S' },
    ],
    keySchema: [
      { name: 'userId', keyType: 'HASH' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-credit_expiries',
    attributes: [
      { name: 'userId', type: 'S' },
      { name: 'expiresAt', type: 'S' },
    ],
    keySchema: [
      { name: 'userId', keyType: 'HASH' },
      { name: 'expiresAt', keyType: 'RANGE' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-agencies',
    attributes: [
      { name: 'id', type: 'S' },
    ],
    keySchema: [
      { name: 'id', keyType: 'HASH' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-agency_members',
    attributes: [
      { name: 'agencyId', type: 'S' },
      { name: 'userId', type: 'S' },
    ],
    keySchema: [
      { name: 'agencyId', keyType: 'HASH' },
      { name: 'userId', keyType: 'RANGE' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-reviews',
    attributes: [
      { name: 'id', type: 'S' },
    ],
    keySchema: [
      { name: 'id', keyType: 'HASH' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-projects',
    attributes: [
      { name: 'userId', type: 'S' },
      { name: 'id', type: 'S' },
    ],
    keySchema: [
      { name: 'userId', keyType: 'HASH' },
      { name: 'id', keyType: 'RANGE' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    name: 'propreel-settings',
    attributes: [
      { name: 'id', type: 'S' },
    ],
    keySchema: [
      { name: 'id', keyType: 'HASH' },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
  {
    // First-party auth sessions (opaque token id → userId). expiresAt is
    // epoch-seconds for DynamoDB TTL cleanup.
    //
    // userId-index (GSI, added 2026-10-24): session lookups BY USER —
    // deleteSessionsForUser, the Settings → Security session list and the
    // trial sweep — used to Scan the whole table with a userId filter. The
    // GSI turns those into O(user) Queries; code falls back to the scan when
    // the index is absent, so this script can add it to a live table.
    name: 'propreel-sessions',
    attributes: [
      { name: 'id', type: 'S' },
      { name: 'userId', type: 'S' },
    ],
    keySchema: [
      { name: 'id', keyType: 'HASH' },
    ],
    globalSecondaryIndexes: [
      {
        indexName: 'userId-index',
        keySchema: [{ name: 'userId', keyType: 'HASH' }],
        projection: 'ALL',
      },
    ],
    billingMode: 'PAY_PER_REQUEST' as const,
  },
];

async function createTables() {
  console.log(`Creating DynamoDB tables in ${region}...\n`);

  for (const table of TABLES) {
    try {
      console.log(`Creating table: ${table.name}...`);

      const command = new CreateTableCommand({
        TableName: table.name,
        AttributeDefinitions: table.attributes.map(a => ({
          AttributeName: a.name,
          AttributeType: a.type as ScalarAttributeType,
        })),
        KeySchema: table.keySchema.map(k => ({
          AttributeName: k.name,
          KeyType: k.keyType as KeyType,
        })),
        ...(table.globalSecondaryIndexes?.length
          ? {
              GlobalSecondaryIndexes: table.globalSecondaryIndexes.map(g => ({
                IndexName: g.indexName,
                KeySchema: g.keySchema.map(k => ({
                  AttributeName: k.name,
                  KeyType: k.keyType as KeyType,
                })),
                Projection: { ProjectionType: g.projection as 'ALL' | 'KEYS_ONLY' },
              })),
            }
          : {}),
        BillingMode: table.billingMode,
      });

      await client.send(command);

      // Wait for table to be created
      await waitUntilTableExists(
        { client, maxWaitTime: 60 },
        { TableName: table.name }
      );

      console.log(`✓ Table created: ${table.name}\n`);
    } catch (error: any) {
      if (error.name === 'ResourceInUseException') {
        console.log(`⚡ Table already exists: ${table.name}\n`);
        // Existing tables (the live ones predate today's GSI) — add any
        // missing index in place so `npm run create-tables` converges.
        await ensureIndexes(table as any);
      } else {
        console.error(`✗ Error creating ${table.name}:`, error.message);
        process.exit(1);
      }
    }
  }

  console.log('✅ All tables created successfully!');
}

/** Idempotent GSI back-fill for tables created before an index existed. */
async function ensureIndexes(table: {
  name: string;
  attributes: { name: string; type: string }[];
  globalSecondaryIndexes?: { indexName: string; keySchema: { name: string; keyType: string }[]; projection: string }[];
}): Promise<void> {
  if (!table.globalSecondaryIndexes?.length) return;
  try {
    const described = await client.send(new DescribeTableCommand({ TableName: table.name }));
    const existing = new Set((described.Table?.GlobalSecondaryIndexes || []).map(i => i.IndexName));
    for (const gsi of table.globalSecondaryIndexes) {
      if (existing.has(gsi.indexName)) {
        console.log(`⚡ Index already exists: ${table.name}/${gsi.indexName}\n`);
        continue;
      }
      await client.send(new UpdateTableCommand({
        TableName: table.name,
        AttributeDefinitions: table.attributes.map(a => ({
          AttributeName: a.name,
          AttributeType: a.type as ScalarAttributeType,
        })),
        GlobalSecondaryIndexUpdates: [{
          Create: {
            IndexName: gsi.indexName,
            KeySchema: gsi.keySchema.map(k => ({
              AttributeName: k.name,
              KeyType: k.keyType as KeyType,
            })),
            Projection: { ProjectionType: gsi.projection as 'ALL' | 'KEYS_ONLY' },
          },
        }],
      }));
      console.log(`✓ Index created: ${table.name}/${gsi.indexName}\n`);
    }
  } catch (e: any) {
    console.error(`✗ Could not verify/create indexes on ${table.name}:`, e.message);
  }
}

createTables().catch(console.error);
