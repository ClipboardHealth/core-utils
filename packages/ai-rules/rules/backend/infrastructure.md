# Infrastructure

## Terraform

- Provision all infrastructure using Terraform (no clickops)
- Store state in Terraform Cloud with separate state per project and environment
- Pin modules to specific versions

## Repository Layout

- Service-specific Terraform lives in the service repo
- Shared infrastructure lives in cbh-infrastructure
- Security infrastructure lives in cbh-security
- Manage AWS org/accounts/SSO via the security pipeline

## AWS

- Use internal RDS Terraform modules for databases
- Manage all DNS via Route53 Terraform (no manual)
- Run containers on AWS ECS with EC2

## Deployments

- Use immutable Docker tags for deployments (not `latest`)
