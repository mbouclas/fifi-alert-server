# Simple Bearer Token Authentication Test

$baseUrl = "http://localhost:3000"
$testEmail = "testuser@example.com"
$testPassword = "Test1234!"

Write-Host "=== Testing Bearer Token Authentication ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Login
Write-Host "1. Testing login..." -ForegroundColor Yellow
$loginBody = @{
    email    = $testEmail
    password = $testPassword
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
    Write-Host "   ✓ Login successful" -ForegroundColor Green
    $accessToken = $loginResponse.accessToken
    $refreshToken = $loginResponse.refreshToken
    Write-Host "   Access Token: $($accessToken.Substring(0, 50))..." -ForegroundColor Gray
}
catch {
    Write-Host "   ✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 2: Access /auth/me with bearer token
Write-Host "2. Testing /auth/me with Bearer token..." -ForegroundColor Yellow
$headers = @{
    Authorization = "Bearer $accessToken"
}

try {
    $meResponse = Invoke-RestMethod -Uri "$baseUrl/auth/me" -Method GET -Headers $headers
    Write-Host "   ✓ Bearer authentication successful" -ForegroundColor Green
    Write-Host "   User: $($meResponse.email)" -ForegroundColor Gray
    Write-Host "   Roles: $($meResponse.roles.Count)" -ForegroundColor Gray
    Write-Host "   Gates: $($meResponse.gates.Count)" -ForegroundColor Gray
}
catch {
    Write-Host "   ✗ Bearer auth failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 3: Refresh token
Write-Host "3. Testing token refresh..." -ForegroundColor Yellow
$refreshBody = @{
    refreshToken = $refreshToken
} | ConvertTo-Json

try {
    $refreshResponse = Invoke-RestMethod -Uri "$baseUrl/auth/refresh-token" -Method POST -ContentType "application/json" -Body $refreshBody
    Write-Host "   ✓ Token refresh successful" -ForegroundColor Green
    Write-Host "   New Token: $($refreshResponse.accessToken.Substring(0, 50))..." -ForegroundColor Gray
}
catch {
    Write-Host "   ✗ Refresh failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== All Tests Passed! ===" -ForegroundColor Green
