import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  loginSchema, 
  registerSchema, 
  routeComputeSchema, 
  priceQuoteSchema,
} from "@shared/schema";
import { verifyAccessToken } from "./services/auth";
import { computeRoute } from "./services/graph";
import { generatePriceQuote } from "./services/pricing";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import fetch from "node-fetch";
import { z } from "zod";

// -----------------------------
// Middleware helpers
// -----------------------------
interface AuthenticatedRequest extends Request {
  user?: { userId: string; email: string; role: string };
}

function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required" });

  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ message: "Invalid or expired token" });

  req.user = payload;
  next();
}

async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// -----------------------------
// WebSocket setup
// -----------------------------
const wsClients = new Set<WebSocket>();
function broadcastToClients(message: any) {
  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

// -----------------------------
// External API setup
// -----------------------------
const AERODATABOX_API_KEY = process.env.AERODATABOX_API_KEY || "";
const AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";

// Cache for external airport data
const airportCache = new Map<string, any>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Enhanced airport search using RapidAPI
async function searchAirportsExternal(query: string) {
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = airportCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `https://${AERODATABOX_HOST}/airports/search/term?q=${encodeURIComponent(query)}&limit=50`,
      {
        headers: {
          'X-RapidAPI-Key': AERODATABOX_API_KEY,
          'X-RapidAPI-Host': AERODATABOX_HOST,
        },
      }
    );

    if (!response.ok) {
      console.error('RapidAPI search failed:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    const airports = data.items?.map((airport: any) => ({
      code: airport.iata || airport.icao,
      name: airport.name,
      city: airport.municipalityName || airport.name,
      country: airport.countryName || airport.country,
      lat: airport.location?.lat || 0,
      lon: airport.location?.lon || 0,
      icao: airport.icao,
      iata: airport.iata,
      source: 'rapidapi'
    })).filter((airport: any) => airport.code && airport.lat && airport.lon) || [];

    // Cache the result
    airportCache.set(cacheKey, {
      data: airports,
      timestamp: Date.now()
    });

    return airports;
  } catch (error) {
    console.error('Error fetching from RapidAPI:', error);
    return [];
  }
}

// Get airport by code from RapidAPI
async function getAirportByCodeExternal(code: string) {
  const cacheKey = `airport:${code.toUpperCase()}`;
  const cached = airportCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `https://${AERODATABOX_HOST}/airports/iata/${code.toUpperCase()}`,
      {
        headers: {
          'X-RapidAPI-Key': AERODATABOX_API_KEY,
          'X-RapidAPI-Host': AERODATABOX_HOST,
        },
      }
    );

    if (!response.ok) {
      // Try ICAO if IATA fails
      const icaoResponse = await fetch(
        `https://${AERODATABOX_HOST}/airports/icao/${code.toUpperCase()}`,
        {
          headers: {
            'X-RapidAPI-Key': AERODATABOX_API_KEY,
            'X-RapidAPI-Host': AERODATABOX_HOST,
          },
        }
      );

      if (!icaoResponse.ok) {
        return null;
      }

      const icaoData = await icaoResponse.json();
      const airport = {
        code: icaoData.iata || icaoData.icao,
        name: icaoData.name,
        city: icaoData.municipalityName || icaoData.name,
        country: icaoData.countryName || icaoData.country,
        lat: icaoData.location?.lat || 0,
        lon: icaoData.location?.lon || 0,
        icao: icaoData.icao,
        iata: icaoData.iata,
        source: 'rapidapi'
      };

      airportCache.set(cacheKey, {
        data: airport,
        timestamp: Date.now()
      });

      return airport;
    }

    const data = await response.json();
    const airport = {
      code: data.iata || data.icao,
      name: data.name,
      city: data.municipalityName || data.name,
      country: data.countryName || data.country,
      lat: data.location?.lat || 0,
      lon: data.location?.lon || 0,
      icao: data.icao,
      iata: data.iata,
      source: 'rapidapi'
    };

    airportCache.set(cacheKey, {
      data: airport,
      timestamp: Date.now()
    });

    return airport;
  } catch (error) {
    console.error(`Error fetching airport ${code} from RapidAPI:`, error);
    return null;
  }
}

// -----------------------------
// Rate Limiters
// -----------------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many auth attempts, please try again later" },
});

const priceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: "Too many pricing requests, please try again later" },
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { message: "Too many search requests, please try again later" },
});

// -----------------------------
// Routes
// -----------------------------
export async function registerRoutes(app: Express): Promise<Server> {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "development" ? false : undefined,
  }));
  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  }));

  // Enhanced Airports endpoint with RapidAPI integration
  app.get("/api/airports", searchLimiter, asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined;
    
    try {
      // Get local airports first
      const localAirports = await storage.getAllAirports();
      
      if (!search) {
        // Return local airports if no search query
        return res.json(localAirports);
      }

      // Search local airports
      const localFiltered = localAirports.filter(a =>
        a.code.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.city.toLowerCase().includes(search.toLowerCase())
      );

      // Search external airports via RapidAPI
      const externalAirports = await searchAirportsExternal(search);
      
      // Combine and deduplicate results (local takes priority)
      const localCodes = new Set(localFiltered.map(a => a.code));
      const combined = [
        ...localFiltered,
        ...externalAirports.filter((a: any) => !localCodes.has(a.code))
      ];

      // Limit results to prevent overwhelming the UI
      const limited = combined.slice(0, 50);
      
      console.log(`Airport search for "${search}": ${localFiltered.length} local, ${externalAirports.length} external, ${limited.length} total`);
      
      return res.json(limited);
    } catch (error) {
      console.error('Airport search error:', error);
      // Fallback to local airports only
      const localAirports = await storage.getAllAirports();
      const filtered = search ? localAirports.filter(a =>
        a.code.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.city.toLowerCase().includes(search.toLowerCase())
      ) : localAirports;
      
      return res.json(filtered);
    }
  }));

  // Enhanced airport by code endpoint
  app.get("/api/airports/:code", asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    
    try {
      // Try local database first
      let airport = await storage.getAirportByCode(code);
      
      if (!airport) {
        // Try RapidAPI
        airport = await getAirportByCodeExternal(code);
      }
      
      if (!airport) {
        return res.status(404).json({ message: "Airport not found" });
      }
      
      return res.json(airport);
    } catch (error) {
      console.error(`Error fetching airport ${code}:`, error);
      return res.status(404).json({ message: "Airport not found" });
    }
  }));

  // Enhanced route computation with better error handling
  app.get("/api/route", asyncHandler(async (req, res) => {
    try {
      const schema = z.object({
        from: z.string().length(3),
        to: z.string().length(3),
        algorithm: z.string().default("dijkstra"),
      });
      
      const { from, to, algorithm } = schema.parse(req.query);
      console.log(`Computing route: ${from} -> ${to} using ${algorithm}`);

      // Get airports and routes
      const airports = await storage.getAllAirports();
      const routes = await storage.getActiveRoutes();
      
      console.log(`Found ${airports.length} airports, ${routes.length} routes`);
      
      // Check if both airports exist in our local database
      const fromAirport = airports.find(a => a.code === from);
      const toAirport = airports.find(a => a.code === to);
      
      if (!fromAirport || !toAirport) {
        console.log(`Airports not found in local DB: from=${!!fromAirport}, to=${!!toAirport}`);
        return res.status(404).json({ 
          message: "Route not available. Only routes between seeded airports are supported.",
          availableAirports: airports.map(a => a.code)
        });
      }

      const result = await computeRoute(airports, routes, from, to, algorithm);
      
      if (!result) {
        console.log(`No route computed between ${from} and ${to}`);
        return res.status(404).json({ message: "No route found" });
      }

      console.log(`Route computed successfully:`, result);
      broadcastToClients({ type: "route:recomputed", data: { from, to, algorithm, ...result } });
      return res.json(result);
    } catch (error) {
      console.error('Route computation error:', error);
      return res.status(500).json({ 
        message: "Error computing route", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }));

  // Enhanced price quote endpoint
  app.get("/api/quote", priceLimiter, asyncHandler(async (req, res) => {
    try {
      const schema = z.object({
        from: z.string().length(3),
        to: z.string().length(3),
        pax: z.coerce.number().int().positive().default(1),
        algorithm: z.string().default("dijkstra"),
      });
      
      const { from, to, pax, algorithm } = schema.parse(req.query);
      console.log(`Computing quote: ${from} -> ${to}, ${pax} passengers, ${algorithm}`);

      const airports = await storage.getAllAirports();
      const routes = await storage.getActiveRoutes();

      // Check if both airports exist in our local database
      const fromAirport = airports.find(a => a.code === from);
      const toAirport = airports.find(a => a.code === to);
      
      if (!fromAirport || !toAirport) {
        return res.status(404).json({ 
          message: "Pricing not available. Only routes between seeded airports are supported.",
          availableAirports: airports.map(a => a.code)
        });
      }

      const routeResult = await computeRoute(airports, routes, from, to, algorithm);
      if (!routeResult) {
        return res.status(404).json({ message: "No route found for pricing" });
      }

      const priceConfig = await storage.getPriceConfig();
      if (!priceConfig) {
        return res.status(500).json({ message: "Price configuration not found" });
      }

      const offers = generatePriceQuote(routeResult.path, routeResult.totalDistance, pax, priceConfig);
      console.log(`Generated ${offers.length} offers`);
      
      return res.json({ route: routeResult, offers, config: priceConfig });
    } catch (error) {
      console.error('Quote computation error:', error);
      return res.status(500).json({ 
        message: "Error computing quote", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }));

  // Debug endpoint to check available routes
  app.get("/api/debug/routes", asyncHandler(async (req, res) => {
    const airports = await storage.getAllAirports();
    const routes = await storage.getActiveRoutes();
    
    return res.json({
      airports: airports.length,
      routes: routes.length,
      airportCodes: airports.map(a => a.code),
      sampleRoutes: routes.slice(0, 10)
    });
  }));

  // -----------------------------
  // HTTP + WS Server
  // -----------------------------
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      wsClients.delete(ws);
    });
  });

  return httpServer;
}