/**
 * Test script for OpenSky API endpoints
 * 
 * This script tests the server endpoints and displays the response data
 * Run this while the server is running: npm run server
 */

const BASE_URL = 'http://localhost:3001';

async function testEndpoint(name, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`\nResponse:`);
    console.log(JSON.stringify(data, null, 2));
    
    // If it's the aircraft endpoint, show some statistics
    if (data.success && data.data) {
      console.log(`\nStatistics:`);
      console.log(`- Total aircraft: ${data.count}`);
      
      if (data.data.length > 0) {
        const sample = data.data[0];
        console.log(`\nSample aircraft fields:`);
        Object.keys(sample).forEach(key => {
          const value = sample[key];
          const type = typeof value;
          const displayValue = value === null ? 'null' : 
                              type === 'string' && value.length > 30 ? value.substring(0, 30) + '...' : 
                              value;
          console.log(`  - ${key}: ${displayValue} (${type === 'object' && value === null ? 'null' : type})`);
        });
        
        // Count aircraft with valid positions
        const withPositions = data.data.filter(a => a.latitude !== null && a.longitude !== null).length;
        console.log(`\n- Aircraft with valid positions: ${withPositions}`);
        
        // Show some examples
        console.log(`\nExample aircraft:`);
        data.data.slice(0, 3).forEach((aircraft, idx) => {
          if (aircraft.latitude && aircraft.longitude) {
            console.log(`\n  Aircraft ${idx + 1}:`);
            console.log(`    ICAO24: ${aircraft.icao24}`);
            console.log(`    Callsign: ${aircraft.callsign || 'N/A'}`);
            console.log(`    Country: ${aircraft.originCountry || 'N/A'}`);
            console.log(`    Position: (${aircraft.latitude.toFixed(4)}, ${aircraft.longitude.toFixed(4)})`);
            console.log(`    Altitude: ${aircraft.barometricAltitude ? aircraft.barometricAltitude.toFixed(0) + 'm' : 'N/A'}`);
            console.log(`    Speed: ${aircraft.velocity ? (aircraft.velocity * 3.6).toFixed(1) + ' km/h' : 'N/A'}`);
            console.log(`    Heading: ${aircraft.heading ? aircraft.heading.toFixed(1) + '°' : 'N/A'}`);
          }
        });
      }
    }
    
    return { success: true, data };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🚀 OpenSky API Endpoint Testing');
  console.log('Make sure the server is running: npm run server\n');
  
  // Test root endpoint
  await testEndpoint('Root Endpoint', `${BASE_URL}/`);
  
  // Test health endpoint
  await testEndpoint('Health Check', `${BASE_URL}/api/aircraft/health`);
  
  // Test aircraft endpoint (all aircraft)
  console.log('\n⏳ Fetching aircraft data from OpenSky API (this may take a few seconds)...\n');
  await testEndpoint('Aircraft Data (All)', `${BASE_URL}/api/aircraft`);
  
  // Test with bounding box (UK region)
  await testEndpoint(
    'Aircraft Data (UK Region)', 
    `${BASE_URL}/api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2`
  );
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Testing complete!');
  console.log('='.repeat(60) + '\n');
}

runTests().catch(console.error);

