---
description: "Choosing or pulling a container image: Dockerfile FROM, Compose services, CI workflow images"
---

# Container Registry

- Pull public container images from Amazon ECR Public (`public.ecr.aws`). It is the default registry for every Dockerfile, Compose file, and CI workflow.
- Classify each `FROM` as `scratch`, a name declared by an earlier `AS <stage>`, or an external image. Write the registry explicitly for external images: a bare `FROM node:24-alpine` resolves to Docker Hub, so use `FROM public.ecr.aws/docker/library/node:24-alpine` instead. For `ARG`-parameterized bases, update any in-repository default or build-argument producer that names an external image; leave the `FROM` expression unchanged only when its value is unresolved in the repository.
- Docker Hub official images are published to ECR Public under `public.ecr.aws/docker/library/`.
- For other images, use ECR Public only when the original publisher documents the repository and it includes the requested version for every required platform. Otherwise keep the publisher's explicit upstream registry and say in the PR description which check failed. A same-named repository from an unrelated publisher is not equivalent.
- ECR Public has its own quotas: 1 pull/second per Region unauthenticated plus a 500 GB monthly cap, versus 10/second authenticated or from ECS, Fargate, and EC2. Authenticate ECR Public pulls in CI instead of assuming the default is unlimited.
- Rationale: this avoids Docker Hub's pull limits, the usual cause of `429 Too Many Requests` build failures. It does not make pulls unmetered.
