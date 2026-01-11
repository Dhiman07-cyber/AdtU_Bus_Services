import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const moderatorUid = decodedToken.uid;
    const moderatorEmail = decodedToken.email;

    const body = await request.json();
    const { studentUid } = body;
    const reason = body.reason || "Application rejected by moderator";

    if (!studentUid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is admin or moderator
    const moderatorDoc = await adminDb.collection('moderators').doc(moderatorUid).get();
    const adminDoc = await adminDb.collection('admins').doc(moderatorUid).get();

    if (!moderatorDoc.exists && !adminDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const moderatorData = moderatorDoc.exists ? moderatorDoc.data() : adminDoc.data();

    // Get application data
    const applicationRef = adminDb.collection('applications').doc(studentUid);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const appData = applicationDoc.data()!;
    const formData = appData.formData;
    const now = new Date().toISOString();

    // ✅ CLEANUP: Delete payment proof from Cloudinary
    if (formData.paymentInfo?.paymentEvidenceUrl && cloudinary.config().api_key) {
      try {
        const url = new URL(formData.paymentInfo.paymentEvidenceUrl);
        const pathParts = url.pathname.split('/');

        // Find the part after 'upload' to get the full path
        const uploadIndex = pathParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1) {
          // Get everything after 'upload' (version, folder, filename)
          const afterUpload = pathParts.slice(uploadIndex + 1);
          const fileName = afterUpload[afterUpload.length - 1];

          if (fileName) {
            // Remove version (v1234567890) and get the actual public ID path
            const publicIdParts = afterUpload.filter(part => !part.startsWith('v') || isNaN(Number(part.substring(1))));
            // Remove file extension from the last part
            const lastPart = publicIdParts[publicIdParts.length - 1];
            const nameWithoutExtension = lastPart.split('.').slice(0, -1).join('.');
            publicIdParts[publicIdParts.length - 1] = nameWithoutExtension;
            const publicId = publicIdParts.join('/');

            await cloudinary.uploader.destroy(publicId);
            console.log(`✅ Deleted payment proof from Cloudinary: ${publicId}`);
          }
        }
      } catch (cloudinaryError) {
        console.error('⚠️ Error deleting payment proof from Cloudinary:', cloudinaryError);
      }
    }

    // ✅ CLEANUP: Delete profile photo from Cloudinary
    if (formData.profilePhotoUrl && cloudinary.config().api_key) {
      try {
        const url = new URL(formData.profilePhotoUrl);
        const pathParts = url.pathname.split('/');

        // Find the part after 'upload' to get the full path
        const uploadIndex = pathParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1) {
          // Get everything after 'upload' (version, folder, filename)
          const afterUpload = pathParts.slice(uploadIndex + 1);
          const fileName = afterUpload[afterUpload.length - 1];

          if (fileName) {
            // Remove version (v1234567890) and get the actual public ID path
            const publicIdParts = afterUpload.filter(part => !part.startsWith('v') || isNaN(Number(part.substring(1))));
            // Remove file extension from the last part
            const lastPart = publicIdParts[publicIdParts.length - 1];
            const nameWithoutExtension = lastPart.split('.').slice(0, -1).join('.');
            publicIdParts[publicIdParts.length - 1] = nameWithoutExtension;
            const publicId = publicIdParts.join('/');

            await cloudinary.uploader.destroy(publicId);
            console.log(`✅ Deleted profile photo from Cloudinary: ${publicId}`);
          }
        }
      } catch (cloudinaryError) {
        console.error('⚠️ Error deleting profile photo from Cloudinary:', cloudinaryError);
      }
    }

    // ✅ CLEANUP: Delete from applications collection after rejection
    try {
      await adminDb.collection('applications').doc(studentUid).delete();
      console.log('✅ Deleted rejected applications document for:', studentUid);
    } catch (deleteError) {
      console.warn('⚠️ Could not delete applications doc:', deleteError);
    }

    return NextResponse.json({
      success: true,
      message: 'Application rejected'
    });
  } catch (error: any) {
    console.error('Error rejecting application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject application' },
      { status: 500 }
    );
  }
}

function extractPublicIdFromUrl(url: string): string | null {
  try {
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{transformations}/{version}/{public_id}.{format}
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return matches ? matches[1] : null;
  } catch (error) {
    return null;
  }
}
