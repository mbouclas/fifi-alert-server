#!/bin/bash

# Script to install PostGIS extension in an existing PostgreSQL container
# Usage: ./add-gis-to-postgres.sh

set -e  # Exit on error

echo "=================================="
echo "PostGIS Installation Script"
echo "=================================="
echo ""

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH"
    exit 1
fi

# Prompt for container name
read -p "Enter PostgreSQL container name: " CONTAINER_NAME

# Validate container exists
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ Error: Container '${CONTAINER_NAME}' not found or not running"
    echo ""
    echo "Available running containers:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
    exit 1
fi

echo ""
echo "📦 Installing PostGIS in container: ${CONTAINER_NAME}"
echo ""

# Update package list
echo "Step 1/3: Updating package list..."
docker exec "${CONTAINER_NAME}" bash -c "apt-get update -qq"

# Install PostGIS
echo "Step 2/3: Installing postgresql-17-postgis-3..."
docker exec "${CONTAINER_NAME}" bash -c "apt-get install -y -qq postgresql-17-postgis-3"

# Clean up
echo "Step 3/3: Cleaning up..."
docker exec "${CONTAINER_NAME}" bash -c "rm -rf /var/lib/apt/lists/*"

echo ""
echo "✅ PostGIS installation completed!"
echo ""
echo "Next steps:"
echo "1. Connect to your database"
echo "2. Run: CREATE EXTENSION IF NOT EXISTS postgis;"
echo "3. Verify: SELECT PostGIS_Version();"
echo ""
echo "⚠️  Note: This installation is temporary. If you recreate the container,"
echo "   you'll need to run this script again, or use a custom Dockerfile."
echo ""
