// Test suite for Duet Controller API
// Run with: node tests.js
// Make sure DEV_MODE=true is set in .env file

import 'dotenv/config';
import { app, server, duet, system } from './express.js';
import http from 'http';

const BASE_URL = 'http://localhost:3000';
let testsPassed = 0;
let testsFailed = 0;

// Helper function to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test assertion helper
function assert(condition, testName) {
  if (condition) {
    console.log(`✓ ${testName}`);
    testsPassed++;
  } else {
    console.error(`✗ ${testName}`);
    testsFailed++;
  }
}

// Wait for server to be ready
async function waitForServer(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await makeRequest('GET', '/health');
      return true;
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error('Server did not start');
}

// Run all tests
async function runTests() {
  console.log('\n=== Starting Duet Controller API Tests ===\n');

  try {
    await waitForServer();
    console.log('Server is ready\n');

    // Test 1: Health check
    console.log('--- Health Check Tests ---');
    const healthRes = await makeRequest('GET', '/health');
    assert(healthRes.status === 200, 'Health endpoint returns 200');
    assert(healthRes.data.status === 'ok', 'Health status is ok');
    assert(typeof healthRes.data.duetReady === 'boolean', 'Health includes duetReady');

    // Test 2: Get position
    console.log('\n--- Position Tests ---');
    const posRes = await makeRequest('GET', '/position');
    assert(posRes.status === 200, 'Position endpoint returns 200');
    assert(posRes.data.success === true, 'Position request succeeds');
    assert(typeof posRes.data.data.x === 'number', 'Position contains X coordinate');

    // Test 3: Get state
    const stateRes = await makeRequest('GET', '/state');
    assert(stateRes.status === 200, 'State endpoint returns 200');
    assert(stateRes.data.success === true, 'State request succeeds');
    assert(stateRes.data.data.position !== undefined, 'State contains position');

    // Test 4: SD files list
    // Test 4: SD files list
    console.log('\n--- SD Card Tests ---');
    const filesRes = await makeRequest('GET', '/sd/files');
    assert(filesRes.status === 200, 'SD files endpoint returns 200');
    assert(filesRes.data.success === true, 'SD files request succeeds');
    assert(filesRes.data.data.includes('file list'), 'SD files response contains file list');

    // Test 5: SD info
    // Test 5: SD info
    const sdInfoRes = await makeRequest('GET', '/sd/info');
    assert(sdInfoRes.status === 200, 'SD info endpoint returns 200');
    assert(sdInfoRes.data.success === true, 'SD info request succeeds');

    // Test 5a: Upload file to SD
    const uploadRes = await makeRequest('POST', '/sd/upload', { 
      filename: 'test-upload.g',
      content: 'G28\nG0 X10 Y10\nM0'
    });
    assert(uploadRes.status === 200, 'Upload file endpoint returns 200');
    assert(uploadRes.data.success === true, 'Upload file request succeeds');

    const uploadNoDataRes = await makeRequest('POST', '/sd/upload', { filename: 'test.g' });
    assert(uploadNoDataRes.status === 400, 'Upload without content returns 400');

    // Test 6: Execute file
    console.log('\n--- Execute File Tests ---');
    const execRes = await makeRequest('POST', '/execute', { filename: 'test.g' });
    assert(execRes.status === 200, 'Execute endpoint returns 200');
    assert(execRes.data.success === true, 'Execute request succeeds');

    const execNoFileRes = await makeRequest('POST', '/execute', {});
    assert(execNoFileRes.status === 400, 'Execute without filename returns 400');

    // Test 7: Pause
    // Test 7: Pause
    console.log('\n--- Control Tests ---');
    const pauseRes = await makeRequest('POST', '/pause');
    assert(pauseRes.status === 200, 'Pause endpoint returns 200');
    assert(pauseRes.data.success === true, 'Pause request succeeds');

    // Test 8: Cancel
    // Test 8: Cancel
    const cancelRes = await makeRequest('POST', '/cancel');
    assert(cancelRes.status === 200, 'Cancel endpoint returns 200');
    assert(cancelRes.data.success === true, 'Cancel request succeeds');

    // Test 9: Emergency stop
    // Test 9: Emergency stop
    const estopRes = await makeRequest('POST', '/emergency-stop');
    assert(estopRes.status === 200, 'Emergency stop endpoint returns 200');
    assert(estopRes.data.success === true, 'Emergency stop request succeeds');

    // Test 10: Home all
    console.log('\n--- Movement Tests ---');
    const homeRes = await makeRequest('POST', '/home');
    assert(homeRes.status === 200, 'Home endpoint returns 200');
    assert(homeRes.data.success === true, 'Home request succeeds');

    // Test 11: Go to location fast
    // Test 11: Go to location fast
    const fastRes = await makeRequest('POST', '/goto/fast', { x: 100, y: 50, z: 10 });
    assert(fastRes.status === 200, 'Fast goto endpoint returns 200');
    assert(fastRes.data.success === true, 'Fast goto request succeeds');

    // Test 12: Go to location sloweds');

    // Test 11: Go to location slow
    const slowRes = await makeRequest('POST', '/goto/slow', { x: 100, y: 50, z: 10, f: 1000 });
    assert(slowRes.status === 200, 'Slow goto endpoint returns 200');
    assert(slowRes.data.success === true, 'Slow goto request succeeds');

    // Test 12: GPIO send
    console.log('\n--- GPIO Tests ---');
    const gpioSendRes = await makeRequest('POST', '/gpio/send', { pin: 5, value: 1 });
    assert(gpioSendRes.status === 200, 'GPIO send endpoint returns 200');
    assert(gpioSendRes.data.success === true, 'GPIO send request succeeds');

    const gpioSendNoDataRes = await makeRequest('POST', '/gpio/send', {});
    assert(gpioSendNoDataRes.status === 400, 'GPIO send without data returns 400');

    // Test 13: GPIO read
    const gpioReadRes = await makeRequest('GET', '/gpio/read?pin=5');
    assert(gpioReadRes.status === 200, 'GPIO read endpoint returns 200');
    assert(gpioReadRes.data.success === true, 'GPIO read request succeeds');

    const gpioReadNoPinRes = await makeRequest('GET', '/gpio/read');
    assert(gpioReadNoPinRes.status === 400, 'GPIO read without pin returns 400');

    // Test 14: 404 handling
    console.log('\n--- Error Handling Tests ---');
    const notFoundRes = await makeRequest('GET', '/invalid-route');
    assert(notFoundRes.status === 404, '404 for invalid route');
    assert(notFoundRes.data.success === false, '404 response has success false');

    // Test 15: Partial movement commands
    console.log('\n--- Edge Case Tests ---');
    const partialMoveRes = await makeRequest('POST', '/goto/fast', { x: 100 });
    assert(partialMoveRes.status === 200, 'Partial movement command succeeds');

    const emptyMoveRes = await makeRequest('POST', '/goto/fast', {});
    assert(emptyMoveRes.status === 200, 'Empty movement command succeeds');

    // Test 16: System management
    console.log('\n--- System Management Tests ---');
    const uptimeRes = await makeRequest('GET', '/system/uptime');
    assert(uptimeRes.status === 200, 'System uptime endpoint returns 200');
    assert(uptimeRes.data.success === true, 'System uptime request succeeds');

    const shutdownRes = await makeRequest('POST', '/system/shutdown', { minutes: 10 });
    assert(shutdownRes.status === 200, 'System shutdown endpoint returns 200');
    assert(shutdownRes.data.success === true, 'System shutdown request succeeds');

    const cancelShutdownRes = await makeRequest('POST', '/system/shutdown/cancel');
    assert(cancelShutdownRes.status === 200, 'Cancel shutdown endpoint returns 200');
    assert(cancelShutdownRes.data.success === true, 'Cancel shutdown request succeeds');

    const restartRes = await makeRequest('POST', '/system/restart');
    assert(restartRes.status === 200, 'System restart endpoint returns 200');
    assert(restartRes.data.success === true, 'System restart request succeeds');

  } catch (error) {
    console.error('\nTest error:', error);
    testsFailed++;
  } finally {
    // Print summary
    console.log('\n=== Test Summary ===');
    console.log(`Tests passed: ${testsPassed}`);
    console.log(`Tests failed: ${testsFailed}`);
    console.log(`Total tests: ${testsPassed + testsFailed}`);

    // Close server
    server.close(() => {
      console.log('\nServer closed');
      process.exit(testsFailed > 0 ? 1 : 0);
    });
  }
}

// Run tests
runTests();