#!/bin/bash
# Push JENGAKWANZA to blocktradersgroupsite-web/thejengakwanzaproject

cd "$(dirname "$0")"

REPO_URL="${1:-https://github.com/blocktradersgroupsite-web/thejengakwanzaproject.git}"

echo "=========================================================="
echo "    Pushing JENGAKWANZA to GitHub Repository:"
echo "    $REPO_URL"
echo "=========================================================="

# Check if git is installed
if ! git --version >/dev/null 2>&1; then
  echo ""
  echo "⚠️  Apple's Xcode Command Line Tools (git) are not yet finished installing."
  echo "👉 Please click 'Install' on the popup window on your Mac screen."
  echo "Once the installation completes, run this script again: ./push_to_github.sh"
  echo ""
  exit 1
fi

# Initialize git if not already
if [ ! -d ".git" ]; then
  echo "=> Initializing Git repository..."
  git init
fi

# Stage all files
echo "=> Staging all project files..."
git add .

# Commit files
echo "=> Committing files..."
git commit -m "JENGAKWANZA Business Management System with Firebase and Vercel support" 2>/dev/null || echo "Nothing new to commit"

# Set branch to main
git branch -M main

# Set remote origin
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

# Push to GitHub
echo "=> Pushing to GitHub (you may be prompted for your GitHub credentials / token)..."
git push -u origin main

echo ""
echo "=========================================================="
echo "✓ Successfully pushed to GitHub!"
echo "Now you can deploy on Vercel: https://vercel.com/new"
echo "=========================================================="
