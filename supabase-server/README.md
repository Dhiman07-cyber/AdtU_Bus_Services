# Supabase Integration Server

This is the backend server for the ADTU Bus Services application that handles all Supabase realtime integration functionality.

## Overview

The Supabase Integration Server is a Node.js/Express application that serves as the bridge between Firestore (primary database) and Supabase (realtime communication). It provides API endpoints for all realtime operations in the bus tracking system.

## Features

- Driver journey management (start/end journey)
- Realtime location broadcasting
- Student waiting flag system
- Attendance tracking
- Notification system
- Data synchronization between Firestore and Supabase

## Prerequisites

- Node.js 16+
- npm or yarn
- Firebase project with service account
- Supabase project

## Installation

1. Navigate to the supabase-server directory:
```bash
cd supabase-server
```

2. Install dependencies:
```bash
npm install
```

## Configuration

Create a `.env` file in the supabase-server directory with the following variables:

```env
# Firebase Admin SDK Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_CLIENT_CERT_URL=your-client-cert-url

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Server Configuration
PORT=3002
```

## API Endpoints

### Driver Endpoints

#### POST `/api/driver/start-journey`
Start a bus journey

**Request Body:**
```json
{
  "busId": "AS-01-DD-9704"
}
```

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

#### POST `/api/driver/end-journey`
End a bus journey

**Request Body:**
```json
{
  "busId": "AS-01-DD-9704"
}
```

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

#### POST `/api/driver/location`
Send location update

**Request Body:**
```json
{
  "busId": "AS-01-DD-9704",
  "lat": 22.5726,
  "lng": 88.3639,
  "speed": 30.5,
  "heading": 180
}
```

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

### Student Endpoints

#### POST `/api/student/waiting-flag`
Create a waiting flag

**Request Body:**
```json
{
  "busId": "AS-01-DD-9704",
  "routeId": "route_123",
  "stopName": "Main Gate"
}
```

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

#### PUT `/api/student/waiting-flag/:flagId`
Update a waiting flag

**Request Body:**
```json
{
  "status": "boarded"
}
```

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

#### DELETE `/api/student/waiting-flag/:flagId`
Remove a waiting flag

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

### Moderator/Admin Endpoints

#### POST `/api/notification`
Send a system notification

**Request Body:**
```json
{
  "title": "Bus Delayed",
  "message": "Bus AS-01-DD-9704 is delayed by 10 minutes",
  "type": "warning",
  "audience": "all"
}
```

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

#### POST `/api/attendance`
Mark student attendance

**Request Body:**
```json
{
  "studentUid": "student_uid_123",
  "busId": "AS-01-DD-9704",
  "photoUrl": "https://example.com/photo.jpg",
  "note": "Boarded at 8:15 AM"
}
```

**Headers:**
```
Authorization: Bearer [Firebase ID Token]
```

### Data Query Endpoints

#### GET `/api/bus-locations/:busId?`
Get bus locations

#### GET `/api/waiting-flags/:busId?`
Get waiting flags

#### GET `/api/driver-status/:driverUid?`
Get driver status

#### GET `/api/notifications`
Get recent notifications

## Development

To run the server in development mode with auto-restart:

```bash
npm run dev
```

To run the server in production mode:

```bash
npm start
```

## Architecture

The server follows a modular architecture with the following components:

### 1. Authentication Middleware
Handles Firebase ID token verification for all protected endpoints.

### 2. API Routes
RESTful endpoints for all bus tracking operations.

### 3. Firebase Integration
Connects to Firestore for static data operations.

### 4. Supabase Integration
Manages all Supabase realtime operations.

### 5. Realtime Broadcasting
Sends updates to Supabase channels for instant frontend updates.

## Error Handling

All endpoints include proper error handling with appropriate HTTP status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Logging

The server logs all operations to the console for debugging and monitoring.

## Deployment

### Using PM2 (Recommended)

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the server:
```bash
pm2 start server.js --name "bus-supabase-server"
```

3. Save the PM2 configuration:
```bash
pm2 save
```

4. Set up startup script:
```bash
pm2 startup
```

### Using Docker

A Dockerfile is included for containerized deployment:

```bash
docker build -t bus-supabase-server .
docker run -p 3002:3002 bus-supabase-server
```

## Monitoring

The server includes a health check endpoint at `/health` that returns:
```json
{
  "status": "OK",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a pull request

## License

This project is licensed under the MIT License.