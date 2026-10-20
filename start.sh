#!/bin/bash
# Startup script for JENGAKWANZA Business Management System

cd "$(dirname "$0")"

echo "=========================================================="
echo "      JENGAKWANZA BUSINESS MANAGEMENT SYSTEM"
echo "      Arusha, Tanzania • P.O.BOX 14991"
echo "      Tel: 0788989889 / 0713550104"
echo "      Email: jengakwanzaltd@gmail.com"
echo "=========================================================="
echo ""
echo "=> Initializing Database & Starting Local Server on Port 8080..."

# Check if port 8080 is available or use another
export PORT=${PORT:-8080}

# Open browser in background after 1 second
(sleep 1 && open "http://localhost:${PORT}" 2>/dev/null || open "public/index.html") &

# Start Ruby Server
exec ruby server.rb
