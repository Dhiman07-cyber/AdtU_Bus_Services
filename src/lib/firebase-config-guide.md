# Firebase Configuration Guide

## Environment Variables

Make sure you have the following environment variables set in your `.env.local` file:

```bash
# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Firebase Admin Configuration (for server-side operations)
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY="your_private_key"

# Optional: Use Firebase Emulator in development
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
```

## Common Firestore Connection Issues

### 1. QUIC Protocol Errors
- **Cause**: Network connectivity issues or firewall blocking QUIC protocol
- **Solution**: The app now handles these gracefully with automatic retry

### 2. WebChannel Connection Errors
- **Cause**: Firestore real-time listener connection issues
- **Solution**: Enhanced error handling with exponential backoff retry

### 3. Permission Denied Errors
- **Cause**: Firestore security rules blocking access
- **Solution**: Check your Firestore security rules in Firebase Console

### 4. Network Timeout Errors
- **Cause**: Slow network or server overload
- **Solution**: Automatic retry with increasing delays

## Error Handling Features

The app now includes:

1. **Enhanced Error Classification**: Distinguishes between connection errors and permission errors
2. **Automatic Retry Logic**: Retries failed operations with exponential backoff
3. **Connection Status Monitoring**: Real-time connection health monitoring
4. **User-Friendly Error Messages**: Clear error messages for different error types
5. **Graceful Degradation**: App continues to work even with connection issues

## Debugging

To debug Firestore connection issues:

1. Check the browser console for detailed error logs
2. Look for the connection status indicator in the navbar
3. Check Firebase Console for any service outages
4. Verify your environment variables are correct
5. Check Firestore security rules

## Performance Optimization

The app now includes:

- Connection pooling and reuse
- Intelligent retry strategies
- Error rate limiting
- Health check monitoring
- Graceful error recovery
