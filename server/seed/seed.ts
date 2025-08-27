import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

console.log('Step 1: Starting enhanced seed script');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..', '..');
dotenv.config({ path: join(rootDir, '.env') });
console.log('Step 2: Environment loaded');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

let storage, haversineKm;

console.log('Step 3: About to import modules');
try {
  const storageModule = await import("../storage.js");
  storage = storageModule.storage;
  console.log('Step 4: Storage imported');
  
  const haversineModule = await import("../utils/haversine.js");
  haversineKm = haversineModule.haversineKm;
  console.log('Step 5: Haversine imported');
} catch (error) {
  console.error('Import error:', error);
  process.exit(1);
}

console.log('Step 6: Testing database connection');
try {
  const airports = await storage.getAllAirports();
  console.log('Step 7: Database connected, found', airports.length, 'airports');
} catch (error) {
  console.error('Database connection error:', error);
  process.exit(1);
}

console.log('Step 8: About to seed airports');
const airports = [
  { code: "DEL", name: "Indira Gandhi Intl", city: "Delhi", country: "India", lat: 28.556, lon: 77.100 },
  { code: "BOM", name: "Chhatrapati Shivaji", city: "Mumbai", country: "India", lat: 19.089, lon: 72.865 },
  { code: "BLR", name: "Kempegowda", city: "Bangalore", country: "India", lat: 13.198, lon: 77.706 },
  { code: "HYD", name: "Rajiv Gandhi", city: "Hyderabad", country: "India", lat: 17.24, lon: 78.43 },
  { code: "MAA", name: "Chennai Intl", city: "Chennai", country: "India", lat: 12.99, lon: 80.17 },
  { code: "CCU", name: "Netaji Subhas Chandra", city: "Kolkata", country: "India", lat: 22.65, lon: 88.44 },
  { code: "PNQ", name: "Pune", city: "Pune", country: "India", lat: 18.58, lon: 73.92 },
  { code: "GOI", name: "Goa", city: "Goa", country: "India", lat: 15.38, lon: 73.83 },
  { code: "AMD", name: "Ahmedabad", city: "Ahmedabad", country: "India", lat: 23.07, lon: 72.63 },
  { code: "COK", name: "Cochin Intl", city: "Kochi", country: "India", lat: 10.15, lon: 76.40 }
];

// Create airports
for (const airport of airports) {
  try {
    console.log('Creating airport:', airport.code);
    await storage.createAirport(airport);
    console.log('Created airport:', airport.code);
  } catch (error: any) {
    if (error.code === '23505') {
      console.log('Airport already exists:', airport.code);
    } else {
      console.error('Error creating airport:', error);
    }
  }
}

console.log('Step 9: Creating comprehensive flight route network');

// Create a map of airports for easy lookup
const airportMap = new Map(airports.map(a => [a.code, a]));

// Enhanced route definitions - ensuring full connectivity
// Major hubs with comprehensive connections
const hubRoutes = [
  // Delhi (DEL) - National capital, connects to all
  ["DEL", "BOM"], ["DEL", "BLR"], ["DEL", "HYD"], ["DEL", "MAA"], 
  ["DEL", "CCU"], ["DEL", "PNQ"], ["DEL", "AMD"], ["DEL", "COK"], ["DEL", "GOI"],
  
  // Mumbai (BOM) - Financial capital, connects to all
  ["BOM", "BLR"], ["BOM", "HYD"], ["BOM", "MAA"], ["BOM", "CCU"],
  ["BOM", "PNQ"], ["BOM", "GOI"], ["BOM", "AMD"], ["BOM", "COK"],
  
  // Bangalore (BLR) - Tech hub, good connectivity
  ["BLR", "HYD"], ["BLR", "MAA"], ["BLR", "CCU"], ["BLR", "COK"],
  ["BLR", "GOI"], ["BLR", "PNQ"], ["BLR", "AMD"],
  
  // Chennai (MAA) - South India hub
  ["MAA", "HYD"], ["MAA", "CCU"], ["MAA", "COK"], ["MAA", "BLR"], 
  ["MAA", "GOI"], ["MAA", "PNQ"],
  
  // Hyderabad (HYD) - Central connectivity
  ["HYD", "CCU"], ["HYD", "COK"], ["HYD", "GOI"], ["HYD", "AMD"], ["HYD", "PNQ"],
  
  // Kolkata (CCU) - Eastern hub
  ["CCU", "COK"], ["CCU", "GOI"], ["CCU", "AMD"], ["CCU", "PNQ"],
  
  // Regional connections
  ["PNQ", "GOI"], ["PNQ", "AMD"], ["PNQ", "COK"], // Pune connections
  ["GOI", "AMD"], ["GOI", "COK"], // Goa connections
  ["AMD", "COK"], // Ahmedabad to Kochi
];

// Additional secondary routes for better network density
const secondaryRoutes = [
  // Cross-regional routes for algorithm testing
  ["MAA", "AMD"], // Chennai to Ahmedabad
  ["CCU", "GOI"], // Kolkata to Goa
  ["HYD", "PNQ"], // Hyderabad to Pune
  ["BLR", "AMD"], // Bangalore to Ahmedabad
];

// Combine all routes
const allRoutes = [...hubRoutes, ...secondaryRoutes];

console.log(`Creating ${allRoutes.length} bidirectional route pairs (${allRoutes.length * 2} total routes)`);

let createdRoutes = 0;
let existingRoutes = 0;
let failedRoutes = 0;

for (const [from, to] of allRoutes) {
  const fromAirport = airportMap.get(from);
  const toAirport = airportMap.get(to);
  
  if (!fromAirport || !toAirport) {
    console.error(`Airport not found: ${from} or ${to}`);
    failedRoutes++;
    continue;
  }
  
  const distance = haversineKm(
    fromAirport.lat, fromAirport.lon,
    toAirport.lat, toAirport.lon
  );
  
  // Create bidirectional routes
  for (const [source, dest] of [[from, to], [to, from]]) {
    try {
      await storage.createRoute({
        from: source,
        to: dest,
        distanceKm: distance,
        active: true
      });
      console.log(`✓ Created route: ${source} → ${dest} (${Math.round(distance)} km)`);
      createdRoutes++;
    } catch (error: any) {
      if (error.code === '23505') {
        console.log(`- Route already exists: ${source} → ${dest}`);
        existingRoutes++;
      } else {
        console.error(`✗ Error creating route ${source} → ${dest}:`, error.message);
        failedRoutes++;
      }
    }
  }
}

console.log('\nStep 10: Route creation summary');
console.log(`- Created: ${createdRoutes} new routes`);
console.log(`- Existing: ${existingRoutes} routes already existed`);
console.log(`- Failed: ${failedRoutes} routes failed to create`);
console.log(`- Total expected: ${allRoutes.length * 2} bidirectional routes`);

// Verify route connectivity
console.log('\nStep 11: Verifying route connectivity');
try {
  const allCreatedRoutes = await storage.getActiveRoutes();
  console.log(`- Database contains ${allCreatedRoutes.length} active routes`);
  
  // Check if each airport has connections
  const connectivityCheck = new Map();
  airports.forEach(airport => {
    const outgoingRoutes = allCreatedRoutes.filter(r => r.from === airport.code);
    const incomingRoutes = allCreatedRoutes.filter(r => r.to === airport.code);
    connectivityCheck.set(airport.code, {
      outgoing: outgoingRoutes.length,
      incoming: incomingRoutes.length,
      total: outgoingRoutes.length + incomingRoutes.length
    });
    console.log(`- ${airport.code}: ${outgoingRoutes.length} outgoing, ${incomingRoutes.length} incoming`);
  });
  
  // Find airports with no connections (problematic)
  const unconnectedAirports = airports.filter(airport => {
    const connectivity = connectivityCheck.get(airport.code);
    return connectivity.total === 0;
  });
  
  if (unconnectedAirports.length > 0) {
    console.warn('⚠️  Airports with no connections:', unconnectedAirports.map(a => a.code));
  } else {
    console.log('✅ All airports have connections');
  }
  
} catch (error) {
  console.error('Error verifying connectivity:', error);
}

// Create or update price configuration
console.log('\nStep 12: Setting up price configuration');
try {
  const priceConfig = {
    baseRate: 4.5, // ₹4.5 per km base rate
    fuelSurcharge: 0.15, // 15% fuel surcharge
    taxes: 0.12, // 12% taxes
    markups: {
      Saver: 1.0, // No markup for saver
      Standard: 1.25, // 25% markup for standard
      Flex: 1.6 // 60% markup for flex
    },
    demandMultipliers: {
      low: 0.8, // 20% discount during low demand
      medium: 1.0, // No adjustment for medium demand
      high: 1.4 // 40% premium during high demand
    },
    minimumFare: 2000 // Minimum fare of ₹2000
  };
  
  await storage.updatePriceConfig(priceConfig);
  console.log('✅ Price configuration updated');
} catch (error) {
  console.error('Error updating price configuration:', error);
}

console.log('\n🎉 Step 13: Enhanced seeding complete');
console.log('The flight network is now fully connected and ready for route computation!');

// Test a sample route to verify everything works
console.log('\nStep 14: Testing route computation...');
try {
  const { computeRoute } = await import("../services/graph.js");
  const testAirports = await storage.getAllAirports();
  const testRoutes = await storage.getActiveRoutes();
  
  // Test CCU to DEL (the route that was failing)
  const testResult = await computeRoute(testAirports, testRoutes, "CCU", "DEL", "dijkstra");
  
  if (testResult) {
    console.log('✅ Test route computation successful:');
    console.log(`- Path: ${testResult.path.join(' → ')}`);
    console.log(`- Distance: ${testResult.totalDistance.toFixed(1)} km`);
    console.log(`- Segments: ${testResult.segments.length}`);
  } else {
    console.log('❌ Test route computation failed');
  }
} catch (error) {
  console.error('Error testing route computation:', error);
}

process.exit(0);