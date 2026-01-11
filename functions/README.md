# ADTU Bus Service - Firebase Cloud Functions

This directory contains Firebase Cloud Functions for the ADTU Bus Service system.

## 📦 Functions

### `getFirestoreHealth`
Fetches Firestore system metrics using Google Cloud Monitoring API.

**Endpoint:** `https://asia-south1-adtu-bus-xq.cloudfunctions.net/getFirestoreHealth`

**Response:**
```json
{
  "storageUsedMB": 45.67,
  "totalDocuments": 1234,
  "readsLast24h": 5678,
  "writesLast24h": 2345,
  "deletesLast24h": 123,
  "updatedAt": "2025-11-02T09:27:00.000Z",
  "projectId": "adtu-bus-xq",
  "status": "success"
}
```

---

## 🚀 Deployment Instructions

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Set Environment Variables

Create a `.env` file in the `functions` directory with the following variables:

```env
FIREBASE_PROJECT_ID=adtu-bus-xq
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@adtu-bus-xq.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GCLOUD_PROJECT=adtu-bus-xq
```

Copy these values from your main `.env` file at the project root.

### 3. Login to Firebase CLI

```bash
firebase login
```

### 4. Initialize Firebase (if not already done)

```bash
firebase init functions
```

Select:
- **Project:** adtu-bus-xq
- **Language:** JavaScript
- **ESLint:** No
- **Install dependencies:** Yes

### 5. Deploy the Function

Deploy all functions:
```bash
firebase deploy --only functions
```

Or deploy a specific function:
```bash
firebase deploy --only functions:getFirestoreHealth
```

### 6. Test the Function

After deployment, test the function:

```bash
curl https://asia-south1-adtu-bus-xq.cloudfunctions.net/getFirestoreHealth
```

---

## 🔧 Local Development

### Run Functions Emulator

```bash
cd functions
npm run serve
```

This will start the Firebase Functions emulator at `http://localhost:5001`

Test locally:
```bash
curl http://localhost:5001/adtu-bus-xq/asia-south1/getFirestoreHealth
```

---

## 📊 Enabling Cloud Monitoring API

The `getFirestoreHealth` function requires Google Cloud Monitoring API to be enabled.

### Enable the API:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **adtu-bus-xq**
3. Navigate to **APIs & Services > Library**
4. Search for "**Cloud Monitoring API**"
5. Click **Enable**

Or use the CLI:
```bash
gcloud services enable monitoring.googleapis.com --project=adtu-bus-xq
```

---

## 🌐 Update Admin Page

After deploying the function, update the function URL in the admin page:

**File:** `/src/app/admin/firestore-health/page.tsx`

**Line 64:**
```typescript
const functionUrl = `https://asia-south1-adtu-bus-xq.cloudfunctions.net/getFirestoreHealth`;
```

---

## 🔒 Security

- Environment variables are stored in `.env` (git-ignored)
- The function uses the same service account as Firebase Admin SDK
- CORS is enabled to allow requests from your Next.js app
- Only admin users can access the `/admin/firestore-health` page

---

## 📈 Monitoring

View function logs:
```bash
firebase functions:log
```

Or in [Firebase Console](https://console.firebase.google.com/project/adtu-bus-xq/functions):
- Navigate to **Functions** tab
- Click on **getFirestoreHealth**
- View logs, usage, and metrics

---

## 🐛 Troubleshooting

### Error: "Missing or insufficient permissions"

**Solution:** Make sure the service account has the required IAM roles:
1. Go to [IAM & Admin](https://console.cloud.google.com/iam-admin/iam)
2. Find `firebase-adminsdk-fbsvc@adtu-bus-xq.iam.gserviceaccount.com`
3. Add roles:
   - **Monitoring Viewer**
   - **Cloud Datastore User**

### Error: "Cloud Monitoring API has not been enabled"

**Solution:** Enable the API using the instructions above.

### Error: "CORS policy blocked"

**Solution:** The function already has CORS enabled. Make sure you're calling it from an allowed origin.

---

## 📚 Resources

- [Firebase Cloud Functions Docs](https://firebase.google.com/docs/functions)
- [Google Cloud Monitoring API](https://cloud.google.com/monitoring/api/v3)
- [Firestore Quotas](https://firebase.google.com/docs/firestore/quotas)

---

## 🎯 Admin Page Access

The Firestore Health Monitor admin page is available at:

**URL:** `https://your-domain.com/admin/firestore-health`

**Access:** Admin users only

**Features:**
- ✅ Real-time Firestore metrics
- ✅ Storage usage tracking
- ✅ Document count
- ✅ Reads/Writes/Deletes (last 24 hours)
- ✅ Quota usage percentages
- ✅ Auto-refresh every 5 minutes
- ✅ Beautiful gradient UI with color-coded alerts
- ✅ Recommendations when approaching quota limits

---

## 📝 Notes

- The function is configured for **asia-south1** region (change in `index.js` if needed)
- Free tier limits are hardcoded in the admin page
- Document count is estimated from main collections (students, drivers, buses, routes, applications)
- Metrics are fetched in real-time from Google Cloud Monitoring API
- Auto-refresh interval is set to 5 minutes (configurable in page.tsx)
