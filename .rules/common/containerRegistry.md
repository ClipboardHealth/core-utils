---
description: "Choosing or pulling a container image: Dockerfile FROM, Compose services, CI workflow images"
---

# Container Registry

- Pull public container images from Amazon ECR Public (`public.ecr.aws`). It is the default registry for every Dockerfile, Compose file, and CI workflow.
- Always write the registry explicitly. A bare `FROM node:24-alpine` resolves to Docker Hub; use `FROM public.ecr.aws/docker/library/node:24-alpine` instead. Docker Hub official images are published to ECR Public under `public.ecr.aws/docker/library/`.
- Docker Hub (`docker.io`), GCR (`gcr.io`), Quay (`quay.io`), and GHCR (`ghcr.io`) are exceptions, allowed only when the image has no ECR Public equivalent. Search ECR Public first and say in the PR description which registry you fell back to and why.
- Rationale: ECR Public pulls are not subject to third-party rate limits from AWS workloads and CI runners, which is the usual cause of `429 Too Many Requests` build failures.
