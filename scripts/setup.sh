#!/bin/bash
# Setup script cho Edico

set -e

echo "=== Edico Setup ==="

# Check Python version
python3 -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11+ required'"
echo "Python version OK"

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies (runtime + dev tooling)
pip install -r requirements-dev.txt

# Create .env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env — please edit with your API keys"
fi

echo "Setup complete! Run: uvicorn src.main:app --reload"
