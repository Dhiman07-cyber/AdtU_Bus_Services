import { useSupabaseSubscription } from '@/hooks/useSupabaseSubscription';

interface BusLocation {
  id: string;
  bus_id: string;
  driver_uid: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  updated_at: string;
}

export const BusLocationTracker = ({ busId }: { busId: string }) => {
  const { data: locations, loading, error } = useSupabaseSubscription<BusLocation>({
    table: 'bus_locations',
    filter: {
      column: 'bus_id',
      value: busId
    },
    event: 'ALL'
  });

  if (loading) return <div>Loading bus location...</div>;
  if (error) return <div>Error: {error}</div>;

  const latestLocation = locations[0];

  return (
    <div>
      <h3>Bus Location</h3>
      {latestLocation ? (
        <div>
          <p>Latitude: {latestLocation.lat}</p>
          <p>Longitude: {latestLocation.lng}</p>
          <p>Updated: {new Date(latestLocation.updated_at).toLocaleString()}</p>
        </div>
      ) : (
        <p>No location data available</p>
      )}
    </div>
  );
};