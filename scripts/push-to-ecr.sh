#!/bin/bash
set -euo pipefail

# Build n8n Docker image and push to ECR.
#
# Usage:
#   ./scripts/push-to-ecr.sh
#
# Environment variables (all optional):
#   AWS_REGION       - AWS region (default: us-east-1)
#   ECR_REPO_NAME    - ECR repository name (default: n8n)
#   IMAGE_TAG        - Image tag (default: git short SHA)
#   SKIP_BUILD       - Set to "true" to skip build (image must already exist locally)
#   DOCKER_PLATFORM  - Target platform (default: linux/arm64 for ARM64 Fargate/Graviton)

REGION="${AWS_REGION:-us-east-1}"
REPO_NAME="${ECR_REPO_NAME:-n8n}"
SKIP_BUILD="${SKIP_BUILD:-false}"

# Default to linux/arm64 for native builds on ARM Macs targeting ARM64 Fargate (Graviton)
export DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/arm64}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
REPO="$REGISTRY/$REPO_NAME"
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "===== n8n → ECR ====="
echo "Image: $REPO:$TAG"
echo "====================="

# Step 1: Build
if [ "$SKIP_BUILD" != "true" ]; then
  echo "Running pnpm build:docker..."
  cd "$ROOT_DIR"
  pnpm build:docker
fi

# Step 2: Ensure ECR repo exists
aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name "$REPO_NAME" --region "$REGION" >/dev/null

# Step 3: Auth + tag + push
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$REGISTRY"

docker tag "n8nio/n8n:local" "$REPO:$TAG"
docker tag "n8nio/n8n:local" "$REPO:latest"
docker push "$REPO:$TAG"
docker push "$REPO:latest"

echo ""
echo "✅ Pushed: $REPO:$TAG"
