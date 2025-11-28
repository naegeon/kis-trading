import { db } from './src/lib/db/client';
import { executionLogs } from './src/lib/db/schema';

async function testLog() {
  try {
    console.log('Testing log insertion...');

    // Insert a test log
    await db.insert(executionLogs).values({
      logLevel: 'INFO',
      message: 'TEST: Manual log entry to verify logging system',
      metadata: { test: true, timestamp: new Date().toISOString() },
      userId: null,
      strategyId: null,
    });

    console.log('✅ Test log inserted successfully');

    // Query logs
    const logs = await db.select().from(executionLogs).limit(10);
    console.log(`Found ${logs.length} logs in database:`);
    logs.forEach(log => {
      console.log(`  - [${log.logLevel}] ${log.message}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

testLog();
