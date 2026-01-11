import { useSupabaseSubscription } from '@/hooks/useSupabaseSubscription';

interface DriverStatus {
  id: string;
  driver_uid: string;
  bus_id: string;
  status: string;
  last_updated: string;
}

export const DriverStatusTracker = ({ driverUid }: { driverUid: string }) => {
  const { data: statuses, loading, error } = useSupabaseSubscription<DriverStatus>({
    table: 'driver_status',
    filter: {
      column: 'driver_uid',
      value: driverUid
    },
    event: 'ALL'
  });

  if (loading) return <div>Loading driver status...</div>;
  if (error) return <div>Error: {error}</div>;

  const currentStatus = statuses[0];

  return (
    <div>
      <h3>Driver Status</h3>
      {currentStatus ? (
        <div>
          <p>Status: {currentStatus.status}</p>
          <p>Bus ID: {currentStatus.bus_id}</p>
          <p>Updated: {new Date(currentStatus.last_updated).toLocaleString()}</p>
        </div>
      ) : (
        <p>No status data available</p>
      )}
    </div>
  );
};