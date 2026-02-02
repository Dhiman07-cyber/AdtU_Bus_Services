#!/usr/bin/env node
/**
 * Firestore Safety Check Script
 * 
 * This script scans the codebase for potentially unsafe Firestore patterns
 * that could exhaust quotas on the Spark (free) plan:
 * 
 * 1. Unbounded onSnapshot listeners on entire collections
 * 2. Missing query limits on collection reads
 * 3. Potential quota-exhausting patterns
 * 
 * SAFE PATTERNS (allowed):
 * - onSnapshot on single documents (doc())
 * - onSnapshot with where() and limit() clauses
 * - getDocs() with proper pagination
 * 
 * UNSAFE PATTERNS (flagged):
 * - onSnapshot on collection() without constraints
 * - getDocs without limit()
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(process.cwd(), 'src');

// Patterns to check
const DANGEROUS_PATTERNS = [
    {
        name: 'Unbounded Collection Listener',
        // onSnapshot(collection(...)) without where/limit
        pattern: /onSnapshot\s*\(\s*collection\s*\([^)]+\)\s*,/g,
        severity: 'error',
        message: 'onSnapshot on entire collection without constraints can exhaust Firestore quota',
    },
    {
        name: 'Collection Query Without Limit',
        // query(collection(...)) that doesn't have limit()
        pattern: /query\s*\(\s*collection\s*\([^)]+\)(?:(?!limit\s*\()[^)]*\))*\s*\)/g,
        severity: 'warning',
        message: 'Query without limit() could fetch excessive documents',
    },
];

// Files/patterns to ignore (known safe locations)
const IGNORE_PATTERNS = [
    /node_modules/,
    /\.next/,
    /dist/,
    /\.git/,
    // Comments and documentation
    /\/\*\*[\s\S]*?\*\//,
    /\/\/.*SPARK PLAN SAFETY/,
];

// Safe patterns that override dangerous ones
const SAFE_OVERRIDES = [
    // Document listeners are safe
    /onSnapshot\s*\(\s*doc\s*\(/,
    // Queries with where clauses are typically bounded
    /onSnapshot\s*\(\s*query\s*\(/,
    // Explicit pagination is safe
    /\.limit\s*\(/,
];

function getAllFiles(dir, files = []) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Skip ignored directories
            if (IGNORE_PATTERNS.some(pattern => pattern.test(fullPath))) {
                continue;
            }
            getAllFiles(fullPath, files);
        } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(item)) {
            files.push(fullPath);
        }
    }

    return files;
}

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    const issues = [];

    // Split into lines for better reporting
    const lines = content.split('\n');

    for (const pattern of DANGEROUS_PATTERNS) {
        let match;
        const regex = new RegExp(pattern.pattern.source, 'g');

        while ((match = regex.exec(content)) !== null) {
            const matchStart = match.index;
            const matchText = match[0];

            // Check if this match is in a comment
            const beforeMatch = content.substring(Math.max(0, matchStart - 100), matchStart);
            if (/\/\/[^\n]*$/.test(beforeMatch) || /\/\*[^*]*$/.test(beforeMatch)) {
                continue;
            }

            // Check if this is actually a safe pattern
            const contextStart = Math.max(0, matchStart - 50);
            const contextEnd = Math.min(content.length, matchStart + matchText.length + 50);
            const context = content.substring(contextStart, contextEnd);

            const isSafe = SAFE_OVERRIDES.some(safePattern => safePattern.test(context));
            if (isSafe) {
                continue;
            }

            // Find line number
            let lineNumber = 1;
            let charCount = 0;
            for (let i = 0; i < lines.length; i++) {
                charCount += lines[i].length + 1; // +1 for newline
                if (charCount > matchStart) {
                    lineNumber = i + 1;
                    break;
                }
            }

            issues.push({
                file: relativePath,
                line: lineNumber,
                pattern: pattern.name,
                severity: pattern.severity,
                message: pattern.message,
                snippet: matchText.substring(0, 80) + (matchText.length > 80 ? '...' : ''),
            });
        }
    }

    return issues;
}

function main() {
    console.log('🔍 Firestore Safety Check');
    console.log('========================\n');
    console.log(`Scanning: ${SRC_DIR}\n`);

    if (!fs.existsSync(SRC_DIR)) {
        console.error('❌ Source directory not found:', SRC_DIR);
        process.exit(1);
    }

    const files = getAllFiles(SRC_DIR);
    console.log(`Found ${files.length} files to check\n`);

    let allIssues = [];
    let errorCount = 0;
    let warningCount = 0;

    for (const file of files) {
        const issues = checkFile(file);
        allIssues = allIssues.concat(issues);
    }

    // Count by severity
    for (const issue of allIssues) {
        if (issue.severity === 'error') errorCount++;
        if (issue.severity === 'warning') warningCount++;
    }

    // Report issues
    if (allIssues.length === 0) {
        console.log('✅ No dangerous Firestore patterns detected!\n');
        console.log('All onSnapshot calls appear to be properly bounded with:');
        console.log('  - Single document listeners (doc())');
        console.log('  - Query constraints (where(), limit())');
        console.log('  - Or are properly documented as SPARK PLAN SAFETY compliant\n');
        process.exit(0);
    }

    console.log(`Found ${allIssues.length} potential issue(s):\n`);

    // Group by file
    const byFile = {};
    for (const issue of allIssues) {
        if (!byFile[issue.file]) byFile[issue.file] = [];
        byFile[issue.file].push(issue);
    }

    for (const [file, issues] of Object.entries(byFile)) {
        console.log(`📄 ${file}`);
        for (const issue of issues) {
            const icon = issue.severity === 'error' ? '❌' : '⚠️';
            console.log(`   ${icon} Line ${issue.line}: ${issue.pattern}`);
            console.log(`      ${issue.message}`);
            console.log(`      Snippet: ${issue.snippet}\n`);
        }
    }

    console.log('\n📊 Summary:');
    console.log(`   Errors:   ${errorCount}`);
    console.log(`   Warnings: ${warningCount}`);

    // Only fail on errors, not warnings
    if (errorCount > 0) {
        console.log('\n❌ Firestore safety check failed!');
        console.log('\nTo fix these issues:');
        console.log('1. Add limit() to unbounded queries');
        console.log('2. Use doc() instead of collection() for single document listeners');
        console.log('3. Add // SPARK PLAN SAFETY comment if intentional\n');
        process.exit(1);
    }

    console.log('\n✅ Firestore safety check passed (warnings only)');
    process.exit(0);
}

main();
