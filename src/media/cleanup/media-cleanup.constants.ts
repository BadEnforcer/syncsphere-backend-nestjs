// Queue and job configuration constants for media cleanup

export const MEDIA_CLEANUP_QUEUE = 'media-cleanup';
export const CLEANUP_JOB_NAME = 'cleanup-expired';
export const CLEANUP_BATCH_SIZE = 100;
export const CLEANUP_CRON = '0 * * * *'; // Every hour
