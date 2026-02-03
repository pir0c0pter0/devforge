#!/bin/bash
# =============================================================================
# Docker Image Build Script for Claude Docker
# Builds all base images with multi-architecture support (amd64, arm64)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_IMAGE_DIR="${SCRIPT_DIR}/base-image"

# Image registry and version
REGISTRY="${DOCKER_REGISTRY:-claude-docker}"
VERSION="${VERSION:-latest}"

# User ID and Group ID for non-root user
USER_UID="${USER_UID:-1000}"
USER_GID="${USER_GID:-1000}"

# Multi-architecture settings
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
BUILDER_NAME="claude-docker-builder"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Function to show usage
usage() {
    cat <<EOF
Usage: $0 [OPTIONS] [IMAGE]

Build Claude Docker base images with multi-architecture support.

OPTIONS:
    -h, --help              Show this help message
    -r, --registry REG      Set registry name (default: claude-docker)
    -v, --version VER       Set version tag (default: latest)
    -u, --uid UID           Set user UID (default: 1000)
    -g, --gid GID           Set user GID (default: 1000)
    -p, --platforms PLATS   Set target platforms (default: linux/amd64,linux/arm64)
    --builder NAME          Set buildx builder name (default: claude-docker-builder)
    --no-cache              Build without cache
    --push                  Push images after building
    --multi-arch            Enable multi-architecture build (requires --push or buildx)
    --local                 Build for local architecture only (faster, no push)

IMAGE:
    claude              Build Claude Code only image
    vscode              Build VS Code Server only image
    both                Build combined image (legacy name)
    full                Build combined image (preferred name)
    all                 Build all images (default)

EXAMPLES:
    # Build all images for local use (single architecture)
    $0 --local

    # Build all images with multi-arch support
    $0 --multi-arch --push

    # Build specific image
    $0 claude

    # Build with custom registry and version
    $0 --registry ghcr.io/myuser --version 1.0.0 all

    # Build with matching host UID/GID
    $0 --uid \$(id -u) --gid \$(id -g) all

    # Build and push to registry
    $0 --registry myregistry --push all

    # Build for specific platforms
    $0 --platforms linux/amd64 --push all

ENVIRONMENT VARIABLES:
    DOCKER_REGISTRY     Registry prefix (same as --registry)
    VERSION             Image version tag (same as --version)
    PLATFORMS           Target platforms (same as --platforms)
    USER_UID            Container user UID (same as --uid)
    USER_GID            Container user GID (same as --gid)

EOF
}

# Parse command line arguments
NO_CACHE=""
PUSH=false
MULTI_ARCH=false
LOCAL_BUILD=false
BUILD_TARGET="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -u|--uid)
            USER_UID="$2"
            shift 2
            ;;
        -g|--gid)
            USER_GID="$2"
            shift 2
            ;;
        -p|--platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        --builder)
            BUILDER_NAME="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --multi-arch)
            MULTI_ARCH=true
            shift
            ;;
        --local)
            LOCAL_BUILD=true
            MULTI_ARCH=false
            shift
            ;;
        claude|vscode|both|full|all)
            BUILD_TARGET="$1"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Setup buildx builder for multi-arch builds
setup_buildx() {
    log_step "Setting up Docker buildx builder for multi-architecture builds..."

    # Check if buildx is available
    if ! docker buildx version &> /dev/null; then
        log_error "Docker buildx is not available. Please install Docker Desktop or enable buildx."
        exit 1
    fi

    # Check if builder exists
    if docker buildx inspect "$BUILDER_NAME" &> /dev/null; then
        log_info "Builder '$BUILDER_NAME' already exists"
        docker buildx use "$BUILDER_NAME"
    else
        log_info "Creating new builder '$BUILDER_NAME'"
        docker buildx create --name "$BUILDER_NAME" --driver docker-container --use
    fi

    # Bootstrap the builder
    docker buildx inspect --bootstrap > /dev/null 2>&1

    log_info "Buildx builder is ready"
}

# Function to build an image using docker build (local)
build_image_local() {
    local dockerfile=$1
    local image_name=$2
    local image_tag="${REGISTRY}/${image_name}:${VERSION}"

    log_step "Building ${image_name} from ${dockerfile} (local)..."

    local build_cmd="docker build"
    build_cmd+=" --build-arg USER_UID=${USER_UID}"
    build_cmd+=" --build-arg USER_GID=${USER_GID}"
    build_cmd+=" -f ${BASE_IMAGE_DIR}/${dockerfile}"
    build_cmd+=" -t ${image_tag}"
    if [ "$VERSION" != "latest" ]; then
        build_cmd+=" -t ${REGISTRY}/${image_name}:latest"
    fi
    build_cmd+=" ${NO_CACHE}"
    build_cmd+=" ${BASE_IMAGE_DIR}"

    if eval $build_cmd; then
        log_info "Successfully built ${image_tag}"
        return 0
    else
        log_error "Failed to build ${image_tag}"
        return 1
    fi
}

# Function to build an image using buildx (multi-arch)
build_image_multiarch() {
    local dockerfile=$1
    local image_name=$2
    local image_tag="${REGISTRY}/${image_name}:${VERSION}"

    log_step "Building ${image_name} from ${dockerfile} (multi-arch: ${PLATFORMS})..."

    local output_flag=""
    if [ "$PUSH" = true ]; then
        output_flag="--push"
    else
        # For multi-arch without push, we can only output as image manifest
        output_flag="--output=type=image,push=false"
        log_warn "Multi-arch build without --push will not be loadable locally"
    fi

    local build_cmd="docker buildx build"
    build_cmd+=" --platform ${PLATFORMS}"
    build_cmd+=" --build-arg USER_UID=${USER_UID}"
    build_cmd+=" --build-arg USER_GID=${USER_GID}"
    build_cmd+=" -f ${BASE_IMAGE_DIR}/${dockerfile}"
    build_cmd+=" -t ${image_tag}"
    if [ "$VERSION" != "latest" ]; then
        build_cmd+=" -t ${REGISTRY}/${image_name}:latest"
    fi
    build_cmd+=" ${NO_CACHE}"
    build_cmd+=" ${output_flag}"
    build_cmd+=" ${BASE_IMAGE_DIR}"

    if eval $build_cmd; then
        log_info "Successfully built ${image_tag} for ${PLATFORMS}"
        return 0
    else
        log_error "Failed to build ${image_tag}"
        return 1
    fi
}

# Function to build an image (selects local or multi-arch)
build_image() {
    local dockerfile=$1
    local image_name=$2

    if [ "$MULTI_ARCH" = true ]; then
        build_image_multiarch "$dockerfile" "$image_name"
    else
        build_image_local "$dockerfile" "$image_name"
    fi
}

# Push image to registry
push_image() {
    local image_name=$1
    local image_tag="${REGISTRY}/${image_name}:${VERSION}"

    log_step "Pushing ${image_tag}..."

    if docker push "${image_tag}"; then
        log_info "Successfully pushed ${image_tag}"
        if [ "$VERSION" != "latest" ]; then
            docker push "${REGISTRY}/${image_name}:latest"
            log_info "Successfully pushed ${REGISTRY}/${image_name}:latest"
        fi
        return 0
    else
        log_error "Failed to push ${image_tag}"
        return 1
    fi
}

# Main build process
main() {
    log_info "==================================="
    log_info "Claude Docker Image Build Script"
    log_info "==================================="
    echo ""
    log_info "Configuration:"
    log_info "  Registry:     ${REGISTRY}"
    log_info "  Version:      ${VERSION}"
    log_info "  User UID:     ${USER_UID}"
    log_info "  User GID:     ${USER_GID}"
    log_info "  Build target: ${BUILD_TARGET}"
    log_info "  Multi-arch:   ${MULTI_ARCH}"
    log_info "  Platforms:    ${PLATFORMS}"
    log_info "  Push:         ${PUSH}"
    echo ""

    # Check if base-image directory exists
    if [ ! -d "${BASE_IMAGE_DIR}" ]; then
        log_error "Base image directory not found: ${BASE_IMAGE_DIR}"
        exit 1
    fi

    # Setup buildx if multi-arch build
    if [ "$MULTI_ARCH" = true ]; then
        setup_buildx
    fi

    # Track build status
    local failed_builds=()

    # Determine which Dockerfile to use for full/both
    local full_dockerfile="Dockerfile"
    if [ -f "${BASE_IMAGE_DIR}/Dockerfile" ]; then
        full_dockerfile="Dockerfile"
    elif [ -f "${BASE_IMAGE_DIR}/Dockerfile.both" ]; then
        full_dockerfile="Dockerfile.both"
    fi

    # Build images based on target
    echo ""
    log_step "Starting builds..."
    echo ""

    case $BUILD_TARGET in
        claude)
            build_image "Dockerfile.claude" "claude" || failed_builds+=("claude")
            ;;
        vscode)
            build_image "Dockerfile.vscode" "vscode" || failed_builds+=("vscode")
            ;;
        both|full)
            build_image "$full_dockerfile" "full" || failed_builds+=("full")
            ;;
        all)
            build_image "Dockerfile.claude" "claude" || failed_builds+=("claude")
            build_image "Dockerfile.vscode" "vscode" || failed_builds+=("vscode")
            build_image "$full_dockerfile" "full" || failed_builds+=("full")
            ;;
    esac

    echo ""

    # Check for failed builds
    if [ ${#failed_builds[@]} -gt 0 ]; then
        log_error "Failed to build: ${failed_builds[*]}"
        exit 1
    fi

    log_info "All builds completed successfully!"

    # Push images if requested (only for non-multiarch builds, multiarch pushes during build)
    if [ "$PUSH" = true ] && [ "$MULTI_ARCH" = false ]; then
        echo ""
        log_step "Pushing images to registry..."

        case $BUILD_TARGET in
            claude)
                push_image "claude"
                ;;
            vscode)
                push_image "vscode"
                ;;
            both|full)
                push_image "full"
                ;;
            all)
                push_image "claude"
                push_image "vscode"
                push_image "full"
                ;;
        esac

        log_info "Images pushed successfully!"
    fi

    # Show built images
    echo ""
    log_info "==================================="
    log_info "Build Summary"
    log_info "==================================="
    echo ""

    if [ "$MULTI_ARCH" = false ]; then
        log_step "Built images:"
        docker images "${REGISTRY}/*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | head -20
    else
        log_step "Built multi-arch images for platforms: ${PLATFORMS}"
        echo "  - ${REGISTRY}/claude:${VERSION}"
        echo "  - ${REGISTRY}/vscode:${VERSION}"
        echo "  - ${REGISTRY}/full:${VERSION}"
    fi

    echo ""
    log_info "Done!"
}

# Run main function
main
