import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AirportSearch from "@/components/AirportSearch";
import RouteMap from "@/components/RouteMap";
import PriceBreakdown from "@/components/PriceBreakdown";
import { Airport, RouteSegment, Offer } from "@/types";
import { Search, Plane, Clock, MapPin } from "lucide-react";

interface RouteResult {
  path: string[];
  segments: Array<{
    from: string;
    to: string;
    distanceKm: number;
  }>;
  totalDistance: number;
}

interface QuoteResult {
  route: RouteResult;
  offers: Offer[];
  config: any;
}

export default function SearchPage() {
  const [fromCode, setFromCode] = useState("");
  const [toCode, setToCode] = useState("");
  const [algorithm, setAlgorithm] = useState("dijkstra");
  const [searchTriggered, setSearchTriggered] = useState(false);

  // Fetch airports for the map
  const { data: airports = [] } = useQuery<Airport[]>({
    queryKey: ["airports"],
    queryFn: async () => {
      const res = await fetch("/api/airports");
      if (!res.ok) throw new Error("Failed to fetch airports");
      return res.json();
    },
  });

  // Fetch route and pricing data
  const {
    data: quoteData,
    isLoading,
    error,
  } = useQuery<QuoteResult>({
    queryKey: ["quote", fromCode, toCode, algorithm],
    queryFn: async () => {
      console.log(
        `Fetching quote for ${fromCode} -> ${toCode} using ${algorithm}`
      );
      const res = await fetch(
        `/api/quote?from=${fromCode}&to=${toCode}&algorithm=${algorithm}&pax=1`
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to fetch quote");
      }

      const data = await res.json();
      console.log("Quote data received:", data);
      return data;
    },
    enabled: searchTriggered && !!fromCode && !!toCode,
    retry: 1,
  });

  const handleSearch = () => {
    if (!fromCode || !toCode) {
      alert("Please select both departure and arrival airports");
      return;
    }

    console.log(
      `Searching flights: ${fromCode} -> ${toCode} using ${algorithm}`
    );
    setSearchTriggered(true);
  };

  const calculateFlightTime = (distanceKm: number) => {
    // Average commercial flight speed: 900 km/h
    const hours = distanceKm / 900;
    const totalMinutes = Math.round(hours * 60);
    const displayHours = Math.floor(totalMinutes / 60);
    const displayMinutes = totalMinutes % 60;

    if (displayHours > 0) {
      return `${displayHours}h ${displayMinutes}m`;
    }
    return `${displayMinutes}m`;
  };

  const route = quoteData?.route;
  const offers = quoteData?.offers || [];
  const hasValidRoute =
    route && route.path.length > 0 && route.totalDistance > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header Search Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-2">Find Your Perfect Flight</h1>
          <p className="text-blue-100 mb-8">
            Advanced route optimization with real-time pricing
          </p>

          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <AirportSearch
                  label="From"
                  value={fromCode}
                  onChange={setFromCode}
                  placeholder="Departure city"
                />

                <AirportSearch
                  label="To"
                  value={toCode}
                  onChange={setToCode}
                  placeholder="Arrival city"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Algorithm
                </label>
                <Select value={algorithm} onValueChange={setAlgorithm}>
                  <SelectTrigger className="text-gray-900">
                    <SelectValue placeholder="Select algorithm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dijkstra">
                      Dijkstra (Shortest)
                    </SelectItem>
                    <SelectItem value="astar">A* (Heuristic)</SelectItem>
                    <SelectItem value="bellmanford">Bellman-Ford</SelectItem>
                    <SelectItem value="floydwarshall">
                      Floyd-Warshall
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-1 flex items-end">
                <Button
                  onClick={handleSearch}
                  disabled={!fromCode || !toCode || isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Search className="w-4 h-4 mr-2" />
                  {isLoading ? "Searching..." : "Search Flights"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Route Visualization */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                Route Visualization
              </h2>

              {/* Route Status */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Route:
                  </span>
                  <span className="text-sm font-semibold">
                    {hasValidRoute ? route.path.join(" → ") : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-600">Distance:</span>
                  <span className="text-sm font-medium">
                    {hasValidRoute
                      ? `${route.totalDistance.toFixed(1)} km`
                      : "0 km"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-600">Algorithm:</span>
                  <span className="text-sm">{algorithm}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-600">Flight Time:</span>
                  <span className="text-sm">
                    {hasValidRoute
                      ? calculateFlightTime(route.totalDistance)
                      : "-"}
                  </span>
                </div>
              </div>

              
              {/* Map */}
{searchTriggered && hasValidRoute && (
  <RouteMap
    airports={airports}
    path={route.path}
    segments={route.segments as RouteSegment[]}
    algorithm={algorithm}
    totalDistance={route.totalDistance}
    className="h-96"
  />
)}


              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">
                    {error.message || "Failed to load route data"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Flight Options */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Plane className="w-5 h-5 mr-2 text-blue-600" />
                Available Flights
              </h2>

              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-600">
                    Searching flights...
                  </span>
                </div>
              )}

              {!isLoading && !searchTriggered && (
                <div className="text-center py-8 text-gray-500">
                  <Plane className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Select airports and search to see flight options</p>
                </div>
              )}

              {!isLoading && searchTriggered && !hasValidRoute && (
                <div className="text-center py-8">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">
                      No flight options available for this route.
                    </p>
                    <p className="text-yellow-600 text-sm mt-2">
                      Try selecting different airports or a different algorithm.
                    </p>
                  </div>
                </div>
              )}

              {!isLoading && hasValidRoute && offers.length === 0 && (
                <div className="text-center py-8">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">
                      Unable to generate flight offers.
                    </p>
                    <p className="text-red-600 text-sm mt-2">
                      Please try again.
                    </p>
                  </div>
                </div>
              )}

              {/* Flight Offers */}
              {searchTriggered && hasValidRoute && offers.length >0 && (
                <div className="space-y-4">
                  {offers.map((offer) => (
                    <div
                      key={offer.offerId}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                offer.class === "Saver"
                                  ? "bg-green-100 text-green-800"
                                  : offer.class === "Standard"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-purple-100 text-purple-800"
                              }`}
                            >
                              {offer.class === "Saver"
                                ? "💰"
                                : offer.class === "Standard"
                                ? "⭐"
                                : "✨"}{" "}
                              {offer.class}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {offer.class === "Saver" && "Basic fare"}
                            {offer.class === "Standard" && "Popular choice"}
                            {offer.class === "Flex" && "Full flexibility"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">
                            ₹{offer.totalFare.toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-600">
                            per person
                          </div>
                        </div>
                      </div>

                      {/* Route Summary */}
                      <div className="flex items-center text-sm text-gray-600 mb-3">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {calculateFlightTime(route.totalDistance)}
                        </div>
                        <div className="mx-2">•</div>
                        <div>{route.totalDistance.toFixed(0)} km</div>
                        <div className="mx-2">•</div>
                        <div>
                          {route.path.length - 1}{" "}
                          {route.path.length === 2 ? "stop" : "stops"}
                        </div>
                      </div>

                      {/* Price Breakdown */}
                      <PriceBreakdown
                        fareBreakdown={offer.fareBreakdown}
                        totalFare={offer.totalFare}
                        showDemand={true}
                      />

                      <Button
                        className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          // Handle flight selection
                          console.log("Selected flight:", offer.offerId);
                        }}
                      >
                        Select Flight
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Route Details Section */}
        {hasValidRoute && (
          <div className="mt-8">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Route Details</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">
                        Segment
                      </th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">
                        From
                      </th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">
                        To
                      </th>
                      <th className="text-right py-2 px-3 text-sm font-medium text-gray-600">
                        Distance
                      </th>
                      <th className="text-right py-2 px-3 text-sm font-medium text-gray-600">
                        Flight Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {route.segments.map((segment, index) => (
                      <tr key={index} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-sm">{index + 1}</td>
                        <td className="py-2 px-3 text-sm font-medium">
                          {segment.from}
                        </td>
                        <td className="py-2 px-3 text-sm font-medium">
                          {segment.to}
                        </td>
                        <td className="py-2 px-3 text-sm text-right">
                          {segment.distanceKm.toFixed(1)} km
                        </td>
                        <td className="py-2 px-3 text-sm text-right">
                          {calculateFlightTime(segment.distanceKm)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 font-medium">
                      <td className="py-2 px-3 text-sm">Total</td>
                      <td className="py-2 px-3 text-sm">{route.path[0]}</td>
                      <td className="py-2 px-3 text-sm">
                        {route.path[route.path.length - 1]}
                      </td>
                      <td className="py-2 px-3 text-sm text-right">
                        {route.totalDistance.toFixed(1)} km
                      </td>
                      <td className="py-2 px-3 text-sm text-right">
                        {calculateFlightTime(route.totalDistance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}