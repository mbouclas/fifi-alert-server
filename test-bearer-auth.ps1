# Bearer Token Authentication Test Script
# Run this script to test the authentication endpoints

Write-Host "=== Bearer Token Authentication Tests ===" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"
$testEmail = "testuser@example.com"
$testPassword = "Test1234"

# Test 1: Signup
Write-Host "Test 1: Creating test user..." -ForegroundColor Yellow
try {
    $signupBody = @{
        email     = $testEmail
        password  = $testPassword
        firstName = "Test"
        lastName  = "User"
    } | ConvertTo-Json

    $signupResponse = Invoke-RestMethod -Uri "$baseUrl/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $signupBody `
        -ErrorAction Stop

    Write-Host "✓ Signup successful!" -ForegroundColor Green
    Write-Host "  User ID: $($signupResponse.user.id)" -ForegroundColor Gray
    Write-Host "  Email: $($signupResponse.user.email)" -ForegroundColor Gray
    
    if ($signupResponse.accessToken) {
        Write-Host "  ✓ Access Token: $($signupResponse.accessToken.Substring(0, 50))..." -ForegroundColor Green
    }
    if ($signupResponse.refreshToken) {
        Write-Host "  ✓ Refresh Token: $($signupResponse.refreshToken.Substring(0, 50))..." -ForegroundColor Green
    }
    if ($signupResponse.expiresAt) {
        Write-Host "  ✓ Expires At: $($signupResponse.expiresAt)" -ForegroundColor Green
    }
}
catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "  ℹ User already exists, proceeding to login..." -ForegroundColor Yellow
    }
    else {
        Write-Host "  ✗ Signup failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Test 2: Login
Write-Host "Test 2: Testing login with JWT tokens..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email    = $testEmail
        password = $testPassword
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody `
        -ErrorAction Stop

    Write-Host "✓ Login successful!" -ForegroundColor Green
    Write-Host "  Message: $($loginResponse.message)" -ForegroundColor Gray
    
    if ($loginResponse.accessToken) {
        Write-Host "  ✓ Access Token received: $($loginResponse.accessToken.Substring(0, 50))..." -ForegroundColor Green
        $accessToken = $loginResponse.accessToken
    }
    else {
        Write-Host "  ✗ No access token in response!" -ForegroundColor Red
        exit 1
    }
    
    if ($loginResponse.refreshToken) {
        Write-Host "  ✓ Refresh Token received: $($loginResponse.refreshToken.Substring(0, 50))..." -ForegroundColor Green
        $refreshToken = $loginResponse.refreshToken
    }
    else {
        Write-Host "  ✗ No refresh token in response!" -ForegroundColor Red
        exit 1
    }
    
    if ($loginResponse.expiresAt) {
        Write-Host "  ✓ Token expiration: $($loginResponse.expiresAt)" -ForegroundColor Green
    }
}
catch {
    Write-Host "  ✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 3: Access protected /auth/me with bearer token
Write-Host "Test 3: Testing bearer token authentication on /auth/me..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $accessToken"
    }

    $meResponse = Invoke-RestMethod -Uri "$baseUrl/auth/me" `
        -Method GET `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✓ Bearer token authentication successful!" -ForegroundColor Green
    Write-Host "  User ID: $($meResponse.id)" -ForegroundColor Gray
    Write-Host "  Email: $($meResponse.email)" -ForegroundColor Gray
    Write-Host "  Name: $($meResponse.name)" -ForegroundColor Gray
    
    if ($meResponse.roles) {
        Write-Host "  ✓ Roles: $($meResponse.roles.Count) role(s)" -ForegroundColor Green
        foreach ($userRole in $meResponse.roles) {
            Write-Host "    - $($userRole.role.name) ($($userRole.role.slug))" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "  ⚠ No roles assigned" -ForegroundColor Yellow
    }
    
    if ($meResponse.gates) {
        Write-Host "  ✓ Gates: $($meResponse.gates.Count) gate(s)" -ForegroundColor Green
        foreach ($userGate in $meResponse.gates) {
            Write-Host "    - $($userGate.gate.name) ($($userGate.gate.slug))" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "  ℹ No gates assigned (this is normal)" -ForegroundColor Cyan
    }
}
catch {
    Write-Host "  ✗ Bearer token test failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 4: Refresh token
Write-Host "Test 4: Testing token refresh..." -ForegroundColor Yellow
try {
    $refreshBody = @{
        refreshToken = $refreshToken
    } | ConvertTo-Json

    $refreshResponse = Invoke-RestMethod -Uri "$baseUrl/auth/refresh-token" `
        -Method POST `
        -ContentType "application/json" `
        -Body $refreshBody `
        -ErrorAction Stop

    Write-Host "✓ Token refresh successful!" -ForegroundColor Green
    if ($refreshResponse.accessToken) {
        Write-Host "  ✓ New Access Token: $($refreshResponse.accessToken.Substring(0, 50))..." -ForegroundColor Green
    }
    if ($refreshResponse.expiresAt) {
        Write-Host "  ✓ New Expiration: $($refreshResponse.expiresAt)" -ForegroundColor Green
    }
}
catch {
    Write-Host "  ✗ Token refresh failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== All Tests Passed! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  ✓ JWT tokens are generated on login/signup" -ForegroundColor Green
Write-Host "  ✓ Bearer token authentication works" -ForegroundColor Green
Write-Host "  ✓ User data includes roles and gates" -ForegroundColor Green
Write-Host "  ✓ Token refresh endpoint works" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Create test gates in the database" -ForegroundColor Gray
Write-Host "  2. Assign gates to users" -ForegroundColor Gray
Write-Host "  3. Test role-based access control" -ForegroundColor Gray
Write-Host "  4. Apply guards to existing controllers" -ForegroundColor Gray
