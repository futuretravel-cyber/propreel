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

import { DynamoDBClient, CreateTableCommand, waitUntilTableExists, ScalarAttributeType, KeyType } from '@aws-sdk/client-dynamodb';
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
    name: 'propreel-sessions',
    attributes: [
      { name: 'id', type: 'S' },
    ],
    keySchema: [
      { name: 'id', keyType: 'HASH' },
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
      } else {
        console.error(`✗ Error creating ${table.name}:`, error.message);
        process.exit(1);
      }
    }
  }

  console.log('✅ All tables created successfully!');
}

createTables().catch(console.error);
