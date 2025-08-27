import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { socketService } from "@/lib/socket";
import { Booking } from "@/types";
import { CheckCircle, FileText, Download, Calendar, Plane } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BookingsPage() {
  const { toast } = useToast();

  // Fixed query: use consistent API approach with error handling
  const { data: bookings = [], isLoading, error } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    queryFn: async () => {
      const response = await fetch("/api/bookings", {
        credentials: "include",
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      // Ensure we always return an array
      return Array.isArray(data) ? data : [];
    },
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message === "Unauthorized") return false;
      return failureCount < 3;
    },
  });

  useEffect(() => {
    // Connect to WebSocket for booking notifications
    socketService.connect();

    const handleBookingCreated = (data: any) => {
      toast({
        title: "Booking Confirmed!",
        description: `New booking created: ${data.pnr}`,
      });
    };

    socketService.on("booking:created", handleBookingCreated);

    return () => {
      socketService.off("booking:created", handleBookingCreated);
    };
  }, [toast]);

  // Handle error states
  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-12 h-12 text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Error Loading Bookings
          </h3>
          <p className="text-gray-600 mb-6">
            {error.message === "Unauthorized" 
              ? "Please log in to view your bookings" 
              : "Unable to load bookings. Please try again later."}
          </p>
          {error.message === "Unauthorized" ? (
            <Link href="/login">
              <Button>Sign In</Button>
            </Link>
          ) : (
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900" data-testid="text-page-title">
          My Bookings
        </h1>
        <p className="text-gray-600 mt-2">Manage your flight reservations</p>
      </div>

      {!Array.isArray(bookings) || bookings.length === 0 ? (
        // Empty State
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2" data-testid="text-no-bookings">
            No bookings yet
          </h3>
          <p className="text-gray-600 mb-6">Book your first flight to see it here</p>
          <Link href="/search">
            <Button data-testid="button-search-flights">
              <Plane className="w-4 h-4 mr-2" />
              Search Flights
            </Button>
          </Link>
        </div>
      ) : (
        // Booking Cards
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {bookings.map((booking) => (
            <Card
              key={booking.id}
              className="hover:shadow-lg transition-shadow"
              data-testid={`booking-card-${booking.pnr}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3
                        className="font-semibold text-gray-900"
                        data-testid={`text-pnr-${booking.pnr}`}
                      >
                        PNR: {booking.pnr}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Booked on{" "}
                        {new Date(booking.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800"
                  >
                    Confirmed
                  </Badge>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Route</span>
                    <span
                      className="font-medium"
                      data-testid={`text-route-${booking.pnr}`}
                    >
                      {booking.path.join(" → ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fare Class</span>
                    <span className="font-medium">{booking.fareClass}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Paid</span>
                    <span
                      className="font-medium text-primary-600"
                      data-testid={`text-total-${booking.pnr}`}
                    >
                      ₹{booking.total.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    data-testid={`button-view-details-${booking.pnr}`}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                  <Button
                    className="flex-1"
                    data-testid={`button-download-ticket-${booking.pnr}`}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Ticket
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Activity */}
      {Array.isArray(bookings) && bookings.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Recent Activity
          </h2>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {bookings.slice(0, 3).map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Booking confirmed for {booking.path.join(" → ")}
                      </p>
                      <p className="text-sm text-gray-600">
                        PNR: {booking.pnr} •{" "}
                        {new Date(booking.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      ₹{booking.total.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}