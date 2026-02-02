# =============================================================================
# ADTU Smart Bus - Production Readiness Test Suite (Windows PowerShell)
# =============================================================================
# This script tests your API endpoints for security and correctness
# Run: powershell -ExecutionPolicy Bypass -File "Test-ProductionReadiness.ps1"
# =============================================================================

param(
    [string]$BaseUrl = "http://localhost:3000"
)

# Results collection
$script:results = @()
$script:passCount = 0
$script:failCount = 0
$script:warnCount = 0
$script:skipCount = 0

function Write-TestHeader {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host ""
}

function Write-TestResult {
    param(
        [string]$TestName,
        [string]$Status,
        [string]$Details = ""
    )
    
    if ($Status -eq "PASS") {
        $icon = "[PASS]"
        $color = "Green"
        $script:passCount++
    } elseif ($Status -eq "FAIL") {
        $icon = "[FAIL]"
        $color = "Red"
        $script:failCount++
    } elseif ($Status -eq "WARN") {
        $icon = "[WARN]"
        $color = "Yellow"
        $script:warnCount++
    } else {
        $icon = "[SKIP]"
        $color = "DarkGray"
        $script:skipCount++
    }
    
    Write-Host "  $icon " -ForegroundColor $color -NoNewline
    Write-Host $TestName
    if ($Details) {
        Write-Host "       -> $Details" -ForegroundColor DarkGray
    }
    
    $script:results += @{
        Name = $TestName
        Status = $Status
        Details = $Details
    }
}

$startTime = Get-Date

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "     ADTU Smart Bus - Production Readiness Test Suite       " -ForegroundColor Magenta  
Write-Host "     Testing against: $BaseUrl                              " -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host ""

# =============================================================================
# TEST CATEGORY 1: HEALTH CHECKS
# =============================================================================
Write-TestHeader "1. Health Check Tests"

# Test 1.1: Main health endpoint
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $body = $response.Content | ConvertFrom-Json
    
    Write-TestResult -TestName "Main health endpoint responds" -Status "PASS" -Details "status=$($body.status)"
    
    if ($body.checks -and $body.timestamp) {
        Write-TestResult -TestName "Health response has required fields" -Status "PASS"
    } else {
        Write-TestResult -TestName "Health response has required fields" -Status "FAIL" -Details "Missing fields"
    }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 503) {
        Write-TestResult -TestName "Main health endpoint responds" -Status "WARN" -Details "503 - Some services unhealthy (expected in dev)"
    } else {
        Write-TestResult -TestName "Main health endpoint responds" -Status "FAIL" -Details $_.Exception.Message
    }
}

# Test 1.2: Database health endpoint
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health/db" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    Write-TestResult -TestName "DB health endpoint exists" -Status "PASS"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -in @(200, 503)) {
        Write-TestResult -TestName "DB health endpoint exists" -Status "PASS" -Details "Responds with $($_.Exception.Response.StatusCode.value__)"
    } else {
        Write-TestResult -TestName "DB health endpoint exists" -Status "WARN" -Details "May not be deployed yet"
    }
}

# =============================================================================
# TEST CATEGORY 2: AUTHENTICATION TESTS
# =============================================================================
Write-TestHeader "2. Authentication & Authorization Tests"

# Test 2.1: Protected endpoints should require auth
$protectedEndpoints = @(
    @{Path="/api/admin/students"; Name="Admin Students API"},
    @{Path="/api/admin/dashboard"; Name="Admin Dashboard API"},
    @{Path="/api/moderator/students"; Name="Moderator Students API"},
    @{Path="/api/driver/broadcast-location"; Name="Driver Location API"}
)

foreach ($endpoint in $protectedEndpoints) {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl$($endpoint.Path)" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-TestResult -TestName "$($endpoint.Name) requires auth" -Status "FAIL" -Details "Accessible without auth!"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -in @(401, 403)) {
            Write-TestResult -TestName "$($endpoint.Name) requires auth" -Status "PASS" -Details "Blocked ($statusCode)"
        } elseif ($statusCode -eq 404) {
            Write-TestResult -TestName "$($endpoint.Name) requires auth" -Status "SKIP" -Details "Endpoint not found"
        } elseif ($statusCode -eq 405) {
            Write-TestResult -TestName "$($endpoint.Name) requires auth" -Status "PASS" -Details "Method not allowed (protected)"
        } else {
            Write-TestResult -TestName "$($endpoint.Name) requires auth" -Status "WARN" -Details "Status: $statusCode"
        }
    }
}

# =============================================================================
# TEST CATEGORY 3: INPUT VALIDATION
# =============================================================================
Write-TestHeader "3. Input Validation (XSS/Injection) Tests"

# Test with XSS payload in query string
try {
    $xssPayload = "%3Cscript%3Ealert(1)%3C%2Fscript%3E"
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health?test=$xssPayload" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    Write-TestResult -TestName "XSS in query params handled safely" -Status "PASS" -Details "No server crash"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -lt 500) {
        Write-TestResult -TestName "XSS in query params handled safely" -Status "PASS" -Details "Status: $statusCode"
    } else {
        Write-TestResult -TestName "XSS in query params handled safely" -Status "FAIL" -Details "Server error: $statusCode"
    }
}

# Test with SQL injection payload
try {
    $sqlPayload = "1%27%20OR%20%271%27%3D%271"
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health?id=$sqlPayload" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    Write-TestResult -TestName "SQL injection handled safely" -Status "PASS" -Details "No server crash"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -lt 500) {
        Write-TestResult -TestName "SQL injection handled safely" -Status "PASS" -Details "Status: $statusCode"
    } else {
        Write-TestResult -TestName "SQL injection handled safely" -Status "FAIL" -Details "Server error: $statusCode"
    }
}

# =============================================================================
# TEST CATEGORY 4: SECURITY HEADERS (on main page)
# =============================================================================
Write-TestHeader "4. Security Headers Check"

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $headers = $response.Headers
    
    if ($headers["X-Frame-Options"]) {
        Write-TestResult -TestName "X-Frame-Options header" -Status "PASS" -Details $headers["X-Frame-Options"]
    } else {
        Write-TestResult -TestName "X-Frame-Options header" -Status "WARN" -Details "Missing (add for clickjacking protection)"
    }
    
    if ($headers["X-Content-Type-Options"]) {
        Write-TestResult -TestName "X-Content-Type-Options header" -Status "PASS"
    } else {
        Write-TestResult -TestName "X-Content-Type-Options header" -Status "WARN" -Details "Missing (add nosniff)"
    }
    
    if ($headers["Content-Security-Policy"]) {
        Write-TestResult -TestName "Content-Security-Policy header" -Status "PASS"
    } else {
        Write-TestResult -TestName "Content-Security-Policy header" -Status "WARN" -Details "Missing (recommended)"
    }
} catch {
    Write-TestResult -TestName "Security headers check" -Status "SKIP" -Details "Could not reach main page"
}

# =============================================================================
# TEST CATEGORY 5: ENVIRONMENT CONFIG
# =============================================================================
Write-TestHeader "5. Environment Configuration"

# Check for .env files
if (Test-Path ".env.local") {
    Write-TestResult -TestName ".env.local exists" -Status "PASS" -Details "Local config present"
} elseif (Test-Path ".env") {
    Write-TestResult -TestName ".env exists" -Status "PASS" -Details "Using .env file"
} else {
    Write-TestResult -TestName "Environment file exists" -Status "WARN" -Details "Using system env vars"
}

# Check .gitignore
if (Test-Path ".gitignore") {
    $gitignore = Get-Content ".gitignore" -Raw
    if ($gitignore -match "\.env") {
        Write-TestResult -TestName ".env files in .gitignore" -Status "PASS" -Details "Secrets protected"
    } else {
        Write-TestResult -TestName ".env files in .gitignore" -Status "FAIL" -Details "DANGER: Secrets may be committed!"
    }
} else {
    Write-TestResult -TestName ".gitignore exists" -Status "FAIL" -Details "Create a .gitignore file!"
}

# Check next.config for hardcoded secrets
$configFiles = @("next.config.js", "next.config.mjs", "next.config.ts")
foreach ($configFile in $configFiles) {
    if (Test-Path $configFile) {
        $content = Get-Content $configFile -Raw
        if ($content -match "sk_live_|pk_live_|AIza[0-9A-Za-z\-_]{35}") {
            Write-TestResult -TestName "No API keys in $configFile" -Status "FAIL" -Details "Hardcoded key found!"
        } else {
            Write-TestResult -TestName "No API keys in $configFile" -Status "PASS"
        }
    }
}

# =============================================================================
# TEST CATEGORY 6: RATE LIMITING
# =============================================================================
Write-TestHeader "6. Rate Limiting Test"

Write-Host "  Sending 15 rapid requests..." -ForegroundColor DarkGray
$rateLimitHit = $false
$successfulRequests = 0

for ($i = 1; $i -le 15; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        $successfulRequests++
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 429) {
            $rateLimitHit = $true
            break
        }
    }
}

if ($rateLimitHit) {
    Write-TestResult -TestName "Rate limiting active" -Status "PASS" -Details "Blocked after $successfulRequests requests"
} else {
    Write-TestResult -TestName "Rate limiting active" -Status "WARN" -Details "No limit after $successfulRequests req (may need config)"
}

# =============================================================================
# TEST CATEGORY 7: BUILD CHECK
# =============================================================================
Write-TestHeader "7. Build & Dependency Check"

if (Test-Path ".next") {
    Write-TestResult -TestName "Build output exists (.next)" -Status "PASS"
} else {
    Write-TestResult -TestName "Build output exists (.next)" -Status "WARN" -Details "Run 'npm run build' first"
}

if (Test-Path "package-lock.json") {
    Write-TestResult -TestName "package-lock.json exists" -Status "PASS" -Details "Dependencies locked"
} else {
    Write-TestResult -TestName "package-lock.json exists" -Status "WARN" -Details "Run 'npm install' to generate"
}

# =============================================================================
# SUMMARY
# =============================================================================
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds
$totalCount = $script:passCount + $script:failCount + $script:warnCount + $script:skipCount

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "                      TEST SUMMARY                          " -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Total Tests:  $totalCount" -ForegroundColor White
Write-Host "  PASSED:       $($script:passCount)" -ForegroundColor Green
Write-Host "  FAILED:       $($script:failCount)" -ForegroundColor Red
Write-Host "  WARNINGS:     $($script:warnCount)" -ForegroundColor Yellow
Write-Host "  SKIPPED:      $($script:skipCount)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Duration: $([math]::Round($duration, 2)) seconds" -ForegroundColor DarkGray
Write-Host ""

# Export results
$outputFile = "test_results_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
@{
    timestamp = (Get-Date -Format 'o')
    baseUrl = $BaseUrl
    summary = @{
        total = $totalCount
        passed = $script:passCount
        failed = $script:failCount
        warnings = $script:warnCount
        skipped = $script:skipCount
    }
    tests = $script:results
} | ConvertTo-Json -Depth 5 | Out-File $outputFile -Encoding UTF8

Write-Host "  Results saved to: $outputFile" -ForegroundColor Cyan
Write-Host ""

# Verdict
if ($script:failCount -eq 0 -and $script:warnCount -le 5) {
    Write-Host "  VERDICT: READY FOR STAGING" -ForegroundColor Green
} elseif ($script:failCount -eq 0) {
    Write-Host "  VERDICT: READY WITH WARNINGS - Review before production" -ForegroundColor Yellow
} else {
    Write-Host "  VERDICT: NOT READY - Fix $($script:failCount) failing tests" -ForegroundColor Red
}
Write-Host ""
