import { useSupabaseSubscription } from '@/hooks/useSupabaseSubscription';

interface WaitingFlag {
  id: string;
  student_uid: string;
  bus_id: string;
  route_id: string;
  stop_name: string;
  status: string;
  created_at: string;
  acknowledged_at?: string;
  boarded_at?: string;
}

export const WaitingFlagsTracker = ({ busId }: { busId: string }) => {
  const { data: flags, loading, error } = useSupabaseSubscription<WaitingFlag>({
    table: 'waiting_flags',
    filter: {
      column: 'bus_id',
      value: busId
    },
    event: 'ALL'
  });

  if (loading) return <div>Loading waiting flags...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>Waiting Flags</h3>
      {flags.length > 0 ? (
        <ul>
          {flags.map((flag) => (
            <li key={flag.id}>
              <p>Student: {flag.student_uid}</p>
              <p>Status: {flag.status}</p>
              <p>Stop: {flag.stop_name}</p>
              <p>Created: {new Date(flag.created_at).toLocaleString()}</p>
              {flag.acknowledged_at && (
                <p>Acknowledged: {new Date(flag.acknowledged_at).toLocaleString()}</p>
              )}
              {flag.boarded_at && (
                <p>Boarded: {new Date(flag.boarded_at).toLocaleString()}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No waiting flags</p>
      )}
    </div>
  );
};