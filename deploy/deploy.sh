#!/usr/bin/env bash
# Deploys the SDK asset server to the k3s server, with the image of one commit.
#
# It copies the chart (deploy/helm/sdk) to a fresh temporary folder on the server over SSH, runs
# `helm upgrade --install clan-sdk` there, waits until the new pod is ready, and always deletes the
# copy again. The release is separate from the "clan" release of clan-backend: deploying the SDK
# changes nothing else on the server. There are no secrets to send.
#
# Usage, from anywhere in the repository (Git Bash on Windows, or the CI job "deploy"):
#   deploy/deploy.sh <image tag>     the full commit SHA that the CI job "images" pushed
#
# Settings (environment variables):
#   DEPLOY_HOST        user@host of the server            (default ubuntu@130.61.158.79)
#   DEPLOY_NAMESPACE   the namespace of the clan release  (default clan)
# ssh and scp use your normal SSH key and known_hosts; the CI job prepares its own.
set -euo pipefail

tag="${1:-}"
# The tag ends up in a command on the server, so only image-tag characters are accepted.
if [[ ! "$tag" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "usage: deploy/deploy.sh <image tag>   (the full commit SHA of a build)" >&2
  exit 2
fi

cd "$(dirname "$0")/.."   # the repository root

host="${DEPLOY_HOST:-ubuntu@130.61.158.79}"
namespace="${DEPLOY_NAMESPACE:-clan}"
if [[ ! "$namespace" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
  echo "deploy: DEPLOY_NAMESPACE is not a valid namespace name" >&2
  exit 2
fi

echo "deploy: sdk image tag $tag to $host (namespace $namespace)"

# A folder only this user can read (mktemp -d creates it with mode 700).
remote_dir="$(ssh "$host" 'mktemp -d /tmp/clan-sdk-deploy.XXXXXX')"
cleanup() { ssh "$host" "rm -rf '$remote_dir'" || echo "deploy: could not remove $remote_dir on the server" >&2; }
trap cleanup EXIT

scp -q -r deploy/helm/sdk "$host:$remote_dir/chart"

# On the server. --wait: helm returns only when the new pod is ready (or fails after 5 minutes,
# and the old pod keeps serving).
ssh "$host" bash -s -- "$remote_dir" "$tag" "$namespace" <<'REMOTE'
set -euo pipefail
dir="$1"
tag="$2"
namespace="$3"
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
command -v helm >/dev/null || { echo "deploy: helm is not installed on the server" >&2; exit 1; }
# The pull secret and the certificate issuer come from the clan release, so it must be there first.
kubectl get namespace "$namespace" >/dev/null || { echo "deploy: namespace $namespace is missing: deploy clan-backend first" >&2; exit 1; }

helm upgrade --install clan-sdk "$dir/chart" -n "$namespace" --wait --timeout 5m \
  -f "$dir/chart/values-prod.yaml" \
  --set image.tag="$tag"

echo
helm history clan-sdk -n "$namespace" --max 3
echo
kubectl -n "$namespace" get deploy sdk -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,IMAGE:.spec.template.spec.containers[0].image'
REMOTE

echo "deploy: done, sdk $tag is running"
