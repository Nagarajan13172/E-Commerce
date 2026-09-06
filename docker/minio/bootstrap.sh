#!/bin/sh
# Idempotently prepare the media bucket.
#
# Layout inside the bucket:
#   public/**   anonymously readable  -> product images, brand/category art.
#                                        Stable URLs that browsers and CDNs can
#                                        cache and that crawlers can read.
#   private/**  no anonymous access   -> invoices, return labels. Served only
#                                        through short-lived presigned GET URLs.
set -e

BUCKET="${STORAGE_BUCKET:-ecom-media}"

echo "[minio-init] connecting to MinIO ..."
until mc alias set local http://minio:9000 "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY" >/dev/null 2>&1; do
  echo "[minio-init] waiting for MinIO to accept credentials ..."
  sleep 2
done

if mc ls "local/$BUCKET" >/dev/null 2>&1; then
  echo "[minio-init] bucket '$BUCKET' already exists."
else
  echo "[minio-init] creating bucket '$BUCKET' ..."
  mc mb "local/$BUCKET"
fi

echo "[minio-init] granting anonymous read on '$BUCKET/public' ..."
mc anonymous set download "local/$BUCKET/public" || true

echo "[minio-init] done. Console: http://localhost:9001"
