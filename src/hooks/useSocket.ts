import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { getIdToken } from 'firebase/auth';

interface SocketOptions {
  user: any; // Firebase user object
  url?: string;
}

export const useSocket = ({ user, url }: SocketOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const initializeSocket = async () => {
      try {
        // Get Firebase ID token
        const token = await getIdToken(user);
        
        if (!isMounted) return;

        // Use the environment variable or default to localhost
        const socketUrl = url || process.env.NEXT_PUBLIC_SOCKET_IO_URL || 'http://localhost:3001';
        
        // Initialize socket connection
        socketRef.current = io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
        });

        // Event listeners
        socketRef.current.on('connect', () => {
          console.log('Socket connected');
          if (isMounted) {
            setIsConnected(true);
            setError(null);
          }
        });

        socketRef.current.on('disconnect', () => {
          console.log('Socket disconnected');
          if (isMounted) {
            setIsConnected(false);
          }
        });

        socketRef.current.on('error', (err: any) => {
          console.error('Socket error:', err);
          if (isMounted) {
            setError(err.message || 'Socket connection error');
          }
        });
      } catch (err: any) {
        console.error('Error initializing socket:', err);
        if (isMounted) {
          setError('Failed to initialize socket connection');
        }
      }
    };

    initializeSocket();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user, url]);

  const joinBusRoom = (busId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('joinBusRoom', busId);
    }
  };

  const leaveBusRoom = (busId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('leaveBusRoom', busId);
    }
  };

  const sendDriverLocation = (locationData: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('driverLocation', locationData);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    error,
    joinBusRoom,
    leaveBusRoom,
    sendDriverLocation,
  };
};