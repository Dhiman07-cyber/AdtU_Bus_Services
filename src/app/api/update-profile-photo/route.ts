import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

let adminApp: any;
let auth: any;
let db: any;
let useAdminSDK = false;

// Try to initialize Firebase Admin SDK
try {
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        if (!getApps().length) {
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
            adminApp = initializeApp({
                credential: require('firebase-admin').cert({
                    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey,
                }),
            });
        } else {
            adminApp = getApps()[0];
        }

        auth = getAuth(adminApp);
        db = getFirestore(adminApp);
        useAdminSDK = true;
    }
} catch (error) {
    console.log('Failed to initialize Firebase Admin SDK:', error);
    useAdminSDK = false;
}

/**
 * Extract public ID from Cloudinary URL
 */
function extractCloudinaryPublicId(imageUrl: string): string | null {
    if (!imageUrl || !imageUrl.includes('cloudinary')) return null;

    try {
        const url = new URL(imageUrl);
        const pathParts = url.pathname.split('/');
        // Find the index of 'upload' in the path
        const uploadIndex = pathParts.indexOf('upload');
        if (uploadIndex !== -1 && pathParts.length > uploadIndex + 2) {
            // Get everything after the version number (e.g., v1234567890)
            // Format: /upload/v1234567890/folder/filename.ext
            const relevantParts = pathParts.slice(uploadIndex + 2); // Skip 'upload' and version
            const fullPath = relevantParts.join('/');
            // Remove file extension
            const publicId = fullPath.replace(/\.[^/.]+$/, '');
            return publicId || null;
        }
    } catch (error) {
        console.error('Error extracting public ID:', error);
    }
    return null;
}

/**
 * Delete image from Cloudinary
 */
async function deleteCloudinaryImage(imageUrl: string): Promise<boolean> {
    if (!cloudinary.config().api_key) {
        console.warn('Cloudinary not configured, skipping deletion');
        return false;
    }

    const publicId = extractCloudinaryPublicId(imageUrl);
    if (!publicId) {
        console.warn('Could not extract public ID from URL:', imageUrl);
        return false;
    }

    try {
        const result = await cloudinary.uploader.destroy(publicId);
        console.log(`Cloudinary deletion result for ${publicId}:`, result);
        return result.result === 'ok';
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        return false;
    }
}

export async function POST(request: Request) {
    try {
        const { idToken, targetType, targetId, newImageUrl, oldImageUrl } = await request.json();

        // Validate required input
        if (!idToken || !targetType || !targetId || !newImageUrl) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: idToken, targetType, targetId, newImageUrl'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Validate target type
        if (!['student', 'driver', 'moderator'].includes(targetType)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid target type. Must be student, driver, or moderator'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (useAdminSDK && auth && db) {
            try {
                // Verify the token
                const decodedToken = await auth.verifyIdToken(idToken);
                const requesterUid = decodedToken.uid;

                // Check requester's role
                const userDoc = await db.collection('users').doc(requesterUid).get();
                if (!userDoc.exists) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: 'User not found'
                    }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                const userData = userDoc.data();
                const requesterRole = userData.role;

                // Authorization check
                let isAuthorized = false;

                if (requesterRole === 'admin') {
                    // Admins can update anyone
                    isAuthorized = true;
                } else if (requesterRole === 'moderator') {
                    // Moderators can update students and drivers, and themselves
                    isAuthorized = ['student', 'driver'].includes(targetType) ||
                        (targetType === 'moderator' && targetId === requesterUid);
                } else if (requesterRole === 'driver' && targetType === 'driver' && targetId === requesterUid) {
                    // Drivers can only update their own profile
                    isAuthorized = true;
                }

                if (!isAuthorized) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: 'Unauthorized to update this profile'
                    }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                // Get the collection name based on target type
                const collectionName = targetType === 'student' ? 'students' :
                    targetType === 'driver' ? 'drivers' : 'moderators';

                // Get current document to find old image URL if not provided
                const targetDoc = await db.collection(collectionName).doc(targetId).get();
                if (!targetDoc.exists) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: `${targetType} not found`
                    }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                const currentData = targetDoc.data();
                const currentImageUrl = oldImageUrl || currentData.profilePhotoUrl;

                // Delete old image from Cloudinary if it exists and is different
                if (currentImageUrl && currentImageUrl !== newImageUrl) {
                    console.log(`Deleting old profile photo for ${targetType} ${targetId}`);
                    await deleteCloudinaryImage(currentImageUrl);
                }

                // Update the profile photo URL
                await db.collection(collectionName).doc(targetId).update({
                    profilePhotoUrl: newImageUrl,
                    updatedAt: FieldValue.serverTimestamp()
                });

                console.log(`Profile photo updated for ${targetType} ${targetId}`);

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Profile photo updated successfully'
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });

            } catch (adminError: any) {
                console.error('Error with Admin SDK:', adminError);
                return new Response(JSON.stringify({
                    success: false,
                    error: adminError.message || 'Failed to update profile photo'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        } else {
            return new Response(JSON.stringify({
                success: false,
                error: 'Admin SDK not available'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } catch (error: any) {
        console.error('Error updating profile photo:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Failed to update profile photo'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
