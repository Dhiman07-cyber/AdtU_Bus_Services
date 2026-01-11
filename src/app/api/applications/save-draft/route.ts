import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { ApplicationFormData, Application, ApplicationState, AuditLogEntry } from '@/lib/types/application';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await request.json();
    const { applicationId, formData } = body as { applicationId?: string; formData: ApplicationFormData };

    const now = new Date().toISOString();

    if (applicationId) {
      // Update existing draft
      const appRef = adminDb.collection('applications').doc(applicationId);
      const appDoc = await appRef.get();

      if (!appDoc.exists) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }

      const appData = appDoc.data() as Application;
      
      if (appData.applicantUid !== uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      if (appData.state !== 'draft' && appData.state !== 'noDoc') {
        return NextResponse.json({ 
          error: 'Cannot edit application in current state' 
        }, { status: 400 });
      }

      const auditEntry: AuditLogEntry = {
        actorId: uid,
        actorRole: 'student',
        action: 'draft_updated',
        timestamp: now,
        notes: 'Application draft updated'
      };

      await appRef.update({
        formData,
        state: 'draft',
        updatedAt: now,
        auditLogs: [...(appData.auditLogs || []), auditEntry]
      });

      return NextResponse.json({
        success: true,
        applicationId,
        message: 'Draft updated successfully'
      });
    } else {
      // Create new draft
      const newAppRef = adminDb.collection('applications').doc();
      const newAppId = newAppRef.id;

      const auditEntry: AuditLogEntry = {
        actorId: uid,
        actorRole: 'student',
        action: 'draft_created',
        timestamp: now,
        notes: 'Application draft created'
      };

      const newApplication: Application = {
        applicationId: newAppId,
        applicantUid: uid,
        formData,
        state: 'draft',
        stateHistory: [{ state: 'draft', timestamp: now, actor: uid }],
        verificationAttempts: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        auditLogs: [auditEntry]
      };

      await newAppRef.set(newApplication);

      return NextResponse.json({
        success: true,
        applicationId: newAppId,
        message: 'Draft created successfully'
      });
    }
  } catch (error: any) {
    console.error('Error saving draft:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save draft' },
      { status: 500 }
    );
  }
}

