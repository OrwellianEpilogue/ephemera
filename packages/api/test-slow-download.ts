import 'dotenv/config';
import { slowDownloader } from './src/services/slow-downloader.js';
import { logger } from './src/utils/logger.js';

// Test MD5 - using a real book from Anna's Archive
const TEST_MD5 = '8efbf8e9f8b4592c7b0dbedec9c0ec05';

async function testSlowDownload() {
  logger.info('Testing slow download functionality...');
  logger.info(`MD5: ${TEST_MD5}`);
  logger.info('---\n');

  try {
    const result = await slowDownloader.downloadWithRetry(TEST_MD5, (progressInfo) => {
      // Log progress updates
      if (progressInfo.status === 'bypassing_protection') {
        logger.info(`[${progressInfo.status}] ${progressInfo.message}`);
      } else if (progressInfo.status === 'waiting_countdown') {
        logger.info(`[${progressInfo.status}] ${progressInfo.message}`);
      } else if (progressInfo.status === 'downloading' && progressInfo.downloaded && progressInfo.total) {
        const percent = Math.round((progressInfo.downloaded / progressInfo.total) * 100);
        logger.info(`[${progressInfo.status}] ${percent}% - ${progressInfo.speed} - ETA: ${progressInfo.eta}s`);
      }
    });

    logger.info('\n---');
    logger.info('Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      logger.success(`✅ Success! File downloaded to: ${result.filePath}`);
    } else {
      logger.error(`❌ Failed: ${result.error}`);
    }
  } catch (error: any) {
    logger.error('Test failed with error:', error.message);
    logger.error(error.stack);
  }
}

// Run the test
testSlowDownload();
