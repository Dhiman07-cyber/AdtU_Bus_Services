"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupWaitingFlags = cleanupWaitingFlags;
exports.startCleanupJob = startCleanupJob;
const supabase_js_1 = require("@supabase/supabase-js");
// Initialize Supabase client with service role key for backend operations
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
// TTL configuration (in minutes)
const FLAG_TTL_MINUTES = 60;
async function cleanupWaitingFlags() {
    try {
        console.log('Starting waiting flags cleanup job...');
        // Calculate the cutoff time (FLAGS_TTL_MINUTES ago)
        const cutoffTime = new Date(Date.now() - FLAG_TTL_MINUTES * 60 * 1000).toISOString();
        // Find and mark expired waiting flags as 'expired'
        const { data: expiredFlags, error: selectError } = await supabase
            .from('waiting_flags')
            .select('id')
            .eq('status', 'waiting')
            .lt('created_at', cutoffTime);
        if (selectError) {
            console.error('Error fetching expired waiting flags:', selectError);
            return;
        }
        if (expiredFlags && expiredFlags.length > 0) {
            console.log(`Found ${expiredFlags.length} expired waiting flags`);
            // Update status of expired flags
            const { error: updateError } = await supabase
                .from('waiting_flags')
                .update({ status: 'expired' })
                .in('id', expiredFlags.map(flag => flag.id));
            if (updateError) {
                console.error('Error updating expired waiting flags:', updateError);
            }
            else {
                console.log(`Successfully marked ${expiredFlags.length} flags as expired`);
            }
        }
        else {
            console.log('No expired waiting flags found');
        }
    }
    catch (error) {
        console.error('Error in cleanupWaitingFlags job:', error);
    }
}
// Schedule the cleanup job to run every 10 minutes
function startCleanupJob() {
    // Run immediately
    cleanupWaitingFlags();
    // Schedule to run every 10 minutes
    setInterval(cleanupWaitingFlags, 10 * 60 * 1000);
}
