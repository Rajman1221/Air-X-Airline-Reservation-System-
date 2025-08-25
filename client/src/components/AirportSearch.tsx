import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Airport } from "@/types";
import { Search, MapPin } from "lucide-react";

interface AirportSearchProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
}

export default function AirportSearch({
  label,
  value,
  onChange,
  placeholder,
}: AirportSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Search for airports when typing
  const { data: airports = [], isLoading, error } = useQuery<Airport[]>({
    queryKey: ["airports-search", inputValue],
    queryFn: async () => {
      if (!inputValue.trim() || inputValue.length < 2) return [];
      
      console.log(`Searching airports with query: "${inputValue}"`);
      const res = await fetch(`/api/airports?search=${encodeURIComponent(inputValue.trim())}`);
      
      if (!res.ok) {
        console.error(`Airport search failed: ${res.status} ${res.statusText}`);
        throw new Error("Failed to fetch airports");
      }
      
      const data = await res.json();
      console.log(`Found ${data.length} airports for query "${inputValue}"`);
      return data;
    },
    enabled: inputValue.trim().length >= 2 && isTyping,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Get airport details by code when value is set from parent
  const { data: selectedAirportData } = useQuery<Airport>({
    queryKey: ["airport-by-code", value],
    queryFn: async () => {
      if (!value) return null;
      
      console.log(`Fetching airport details for: ${value}`);
      const res = await fetch(`/api/airports/${value}`);
      
      if (!res.ok) {
        // If single airport endpoint fails, try search
        const searchRes = await fetch(`/api/airports?search=${encodeURIComponent(value)}`);
        if (searchRes.ok) {
          const data = await searchRes.json();
          return data.find((a: Airport) => a.code.toUpperCase() === value.toUpperCase()) || null;
        }
        return null;
      }
      
      return res.json();
    },
    enabled: !!value && !isTyping,
    staleTime: 10 * 60 * 1000,
  });

  // Update input display when value changes from parent or when airport data loads
  useEffect(() => {
    if (value && selectedAirportData && !isTyping) {
      setInputValue(`${selectedAirportData.code} - ${selectedAirportData.city}`);
    } else if (!value && !isTyping) {
      setInputValue("");
    }
  }, [value, selectedAirportData, isTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsTyping(true);
    setShowSuggestions(true);
    
    // Clear parent value if user is typing something new
    if (value && !newValue.startsWith(value)) {
      onChange("");
    }
  };

  const handleSelectAirport = (airport: Airport) => {
    setInputValue(`${airport.code} - ${airport.city}`);
    setIsTyping(false);
    setShowSuggestions(false);
    onChange(airport.code);
  };

  const handleFocus = () => {
    if (inputValue.length >= 2) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      setShowSuggestions(false);
      setIsTyping(false);
    }, 200);
  };

  return (
    <div className="relative">
      <Label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </Label>
      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="pr-10 placeholder:opacity-60 placeholder:font-normal"
          data-testid={`input-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          <Search className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && inputValue.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {isLoading && (
            <div className="p-3 text-gray-500 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              Searching airports...
            </div>
          )}
          
          {error && (
            <div className="p-3 text-red-600 text-sm">
              Failed to search airports. Please try again.
            </div>
          )}
          
          {!isLoading && !error && airports.length === 0 && (
            <div className="p-3 text-gray-500 text-center">
              <MapPin className="w-5 h-5 mx-auto mb-2 text-gray-300" />
              No airports found
            </div>
          )}
          
          {!isLoading && airports.length > 0 && airports.map((airport) => (
            <div
              key={airport.code}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectAirport(airport);
              }}
              className="w-full p-3 text-left hover:bg-blue-50 border-b last:border-b-0 transition-colors cursor-pointer"
              data-testid={`suggestion-${airport.code}`}
            >
              <div className="flex items-center">
                <div className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded mr-3">
                  {airport.code}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {airport.name}
                  </div>
                  <div className="text-sm text-gray-600 truncate">
                    {airport.city}, {airport.country}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}