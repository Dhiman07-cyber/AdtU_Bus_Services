/**
 * Tests for Cloudinary Server Module
 * ────────────────────────────────────
 * Run: npm test -- src/lib/__tests__/cloudinary-server.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    sanitizeFolder,
    isAllowedMimeType,
    isAllowedSize,
    extractPublicId,
    ALLOWED_FOLDERS,
    MAX_FILE_SIZE,
} from '../cloudinary-server';

// ── sanitizeFolder ──────────────────────────────────────────────────────────

describe('sanitizeFolder', () => {
    it('returns the folder if it is in the allowlist', () => {
        for (const f of ALLOWED_FOLDERS) {
            expect(sanitizeFolder(f)).toBe(f);
        }
    });

    it('returns "adtu" for an unknown folder', () => {
        expect(sanitizeFolder('malicious-folder')).toBe('adtu');
        expect(sanitizeFolder('../../etc/passwd')).toBe('adtu');
        expect(sanitizeFolder('')).toBe('adtu');
    });

    it('returns "adtu" for null/undefined', () => {
        expect(sanitizeFolder(null)).toBe('adtu');
        expect(sanitizeFolder(undefined)).toBe('adtu');
    });
});

// ── isAllowedMimeType ───────────────────────────────────────────────────────

describe('isAllowedMimeType', () => {
    it('accepts jpg, png, webp', () => {
        expect(isAllowedMimeType('image/jpeg')).toBe(true);
        expect(isAllowedMimeType('image/jpg')).toBe(true);
        expect(isAllowedMimeType('image/png')).toBe(true);
        expect(isAllowedMimeType('image/webp')).toBe(true);
    });

    it('rejects gif, svg, pdf, and arbitrary types', () => {
        expect(isAllowedMimeType('image/gif')).toBe(false);
        expect(isAllowedMimeType('image/svg+xml')).toBe(false);
        expect(isAllowedMimeType('application/pdf')).toBe(false);
        expect(isAllowedMimeType('text/html')).toBe(false);
        expect(isAllowedMimeType('application/javascript')).toBe(false);
        expect(isAllowedMimeType('')).toBe(false);
    });
});

// ── isAllowedSize ───────────────────────────────────────────────────────────

describe('isAllowedSize', () => {
    it('accepts files under 5 MB', () => {
        expect(isAllowedSize(1)).toBe(true);
        expect(isAllowedSize(1024)).toBe(true);
        expect(isAllowedSize(MAX_FILE_SIZE)).toBe(true);
    });

    it('rejects zero, negative, or oversized files', () => {
        expect(isAllowedSize(0)).toBe(false);
        expect(isAllowedSize(-1)).toBe(false);
        expect(isAllowedSize(MAX_FILE_SIZE + 1)).toBe(false);
        expect(isAllowedSize(100 * 1024 * 1024)).toBe(false);
    });
});

// ── extractPublicId ─────────────────────────────────────────────────────────

describe('extractPublicId', () => {
    it('extracts public_id from a standard Cloudinary URL', () => {
        const url =
            'https://res.cloudinary.com/dg44auhjb/image/upload/v1234567890/ADTU/profile_123.jpg';
        expect(extractPublicId(url)).toBe('ADTU/profile_123');
    });

    it('extracts public_id with nested folders', () => {
        const url =
            'https://res.cloudinary.com/dg44auhjb/image/upload/v1/adtu/sub/photo.png';
        expect(extractPublicId(url)).toBe('adtu/sub/photo');
    });

    it('returns null for non-Cloudinary URLs', () => {
        expect(extractPublicId('https://example.com/photo.jpg')).toBe(null);
        expect(extractPublicId('')).toBe(null);
    });

    it('returns null for malformed URLs', () => {
        expect(extractPublicId('not-a-url')).toBe(null);
        expect(extractPublicId('https://res.cloudinary.com/cloud/image')).toBe(null);
    });
});
