---
description: "Choosing or pulling a container image: Dockerfile FROM, Compose services, CI workflow images"
---

# Container Registry

- Pull public container images from Amazon ECR Public (`public.ecr.aws`). It is the default registry for every Dockerfile, Compose file, and CI workflow.
- Write the registry explicitly on external image references. A bare `FROM node:24-alpine` resolves to Docker Hub; use `FROM public.ecr.aws/docker/library/node:24-alpine` instead. Leave `FROM scratch`, multi-stage aliases (`FROM builder`), and `ARG`-parameterized bases alone — they are not registry references.
- Docker Hub official images are published to ECR Public under `public.ecr.aws/docker/library/`. For everything else, use the vendor's own ECR Public repository: any AWS account can publish to ECR Public, so a same-named repository from an unrelated publisher is not a substitute.
- Docker Hub (`docker.io`), GCR (`gcr.io`), Quay (`quay.io`), and GHCR (`ghcr.io`) are exceptions, allowed only when the image has no ECR Public equivalent. Search ECR Public first and say in the PR description which registry you fell back to and why.
- ECR Public has its own quotas: 1 pull/second per Region unauthenticated plus a 500 GB monthly cap, versus 10/second authenticated or from ECS, Fargate, and EC2. Authenticate ECR Public pulls in CI instead of assuming the default is unlimited.
- Rationale: this avoids Docker Hub's pull limits, the usual cause of `429 Too Many Requests` build failures. It does not make pulls unmetered.
