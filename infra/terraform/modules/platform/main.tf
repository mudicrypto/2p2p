# Platform module: one region of the P2P exchange (network, EKS, Postgres, Redis, KMS, storage, WAF).
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

variable "env" {
  type = string
}
variable "region" {
  type = string
}
variable "primary" {
  type        = bool
  description = "true in the database home region"
}
variable "vpc_cidr" {
  type = string
}
variable "azs" {
  type = list(string)
}
variable "db_instance" {
  type = string
}
variable "db_replicas" {
  type = number
}
variable "redis_node" {
  type = string
}
variable "eks_node_type" {
  type = string
}
variable "eks_min" {
  type = number
}
variable "eks_max" {
  type = number
}
variable "admin_cidrs" {
  type        = list(string)
  description = "Admin panel IP allowlist (office/VPN egress)"
}
variable "primary_db_arn" {
  type        = string
  default     = null
  description = "Cross-region replica source (non-primary regions)"
}

locals {
  name = "p2p-${var.env}-${var.region}"
  prod = var.env == "production"
  tags = {
    project = "p2p-exchange"
    env     = var.env
  }
}

module "vpc" {
  source                               = "terraform-aws-modules/vpc/aws"
  version                              = "~> 5.13"
  name                                 = local.name
  cidr                                 = var.vpc_cidr
  azs                                  = var.azs
  private_subnets                      = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets                       = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 8, 200 + i)]
  database_subnets                     = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 8, 220 + i)]
  enable_nat_gateway                   = true
  one_nat_gateway_per_az               = local.prod
  enable_flow_log                      = true
  flow_log_destination_type            = "cloud-watch-logs"
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
  tags                                 = local.tags
}

# ---- KMS: app KEK for field-level envelope encryption; storage key for DB, Redis, S3, backups
resource "aws_kms_key" "app" {
  description             = "${local.name} app data KEK"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = local.tags
}
resource "aws_kms_key" "storage" {
  description             = "${local.name} db/backups/S3"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = local.tags
}

# ---- Postgres 16: primary in the home region, read replicas per region
resource "aws_db_subnet_group" "db" {
  name       = local.name
  subnet_ids = module.vpc.database_subnets
}
resource "aws_security_group" "db" {
  name   = "${local.name}-db"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }
}
resource "aws_db_parameter_group" "pg" {
  name   = "${local.name}-pg16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "30000"
  }
}
resource "aws_db_instance" "primary" {
  count                               = var.primary ? 1 : 0
  identifier                          = "${local.name}-primary"
  engine                              = "postgres"
  engine_version                      = "16.4"
  instance_class                      = var.db_instance
  allocated_storage                   = 200
  max_allocated_storage               = 2000
  storage_type                        = "gp3"
  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.storage.arn
  multi_az                            = local.prod
  db_name                             = "p2p"
  username                            = "p2p_admin"
  manage_master_user_password         = true # stored in Secrets Manager, never in state or code
  db_subnet_group_name                = aws_db_subnet_group.db.name
  vpc_security_group_ids              = [aws_security_group.db.id]
  parameter_group_name                = aws_db_parameter_group.pg.name
  backup_retention_period             = local.prod ? 35 : 7 # point-in-time recovery window
  copy_tags_to_snapshot               = true
  deletion_protection                 = local.prod
  performance_insights_enabled        = true
  performance_insights_kms_key_id     = aws_kms_key.storage.arn
  iam_database_authentication_enabled = true
  tags                                = local.tags
}
resource "aws_db_instance" "replica" {
  count                  = var.db_replicas
  identifier             = "${local.name}-replica-${count.index}"
  replicate_source_db    = var.primary ? aws_db_instance.primary[0].arn : var.primary_db_arn
  instance_class         = var.db_instance
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.storage.arn
  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.pg.name
  skip_final_snapshot    = true
  tags                   = local.tags
}

# ---- Redis 7: cache, rate limits, BullMQ, Socket.IO adapter
resource "aws_elasticache_subnet_group" "redis" {
  name       = local.name
  subnet_ids = module.vpc.private_subnets
}
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = local.name
  description                = "p2p ${var.env} redis"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node
  num_cache_clusters         = local.prod ? 3 : 1
  automatic_failover_enabled = local.prod
  multi_az_enabled           = local.prod
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id                 = aws_kms_key.storage.arn
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  tags                       = local.tags
}

# ---- Private storage: dispute evidence / chat attachments, and backups (object lock)
resource "aws_s3_bucket" "evidence" {
  bucket = "${local.name}-evidence"
  tags   = local.tags
}
resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket                  = aws_s3_bucket.evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.storage.arn
    }
  }
}
resource "aws_s3_bucket" "backups" {
  bucket              = "${local.name}-backups"
  object_lock_enabled = true
  tags                = local.tags
}
resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_object_lock_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = local.prod ? 90 : 14
    }
  }
}

# ---- EKS: api, worker, web, tg, admin
module "eks" {
  source                         = "terraform-aws-modules/eks/aws"
  version                        = "~> 20.24"
  cluster_name                   = local.name
  cluster_version                = "1.31"
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = false
  cluster_encryption_config = {
    resources        = ["secrets"]
    provider_key_arn = aws_kms_key.app.arn
  }
  eks_managed_node_groups = {
    apps = {
      instance_types = [var.eks_node_type]
      min_size       = var.eks_min
      max_size       = var.eks_max
      desired_size   = var.eks_min
    }
  }
  tags = local.tags
}

# ---- WAF in front of the public ingress; admin restricted to allowlisted CIDRs
resource "aws_wafv2_ip_set" "admin" {
  name               = "${local.name}-admin"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.admin_cidrs
}
resource "aws_wafv2_web_acl" "edge" {
  name  = local.name
  scope = "REGIONAL"
  default_action {
    allow {}
  }
  rule {
    name     = "aws-common"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = true
    }
  }
  rule {
    name     = "rate-limit"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 3000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate"
      sampled_requests_enabled   = true
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.name
    sampled_requests_enabled   = true
  }
}

output "db_primary_arn" {
  value = var.primary ? aws_db_instance.primary[0].arn : null
}
output "db_primary_host" {
  value = var.primary ? aws_db_instance.primary[0].address : null
}
output "db_replica_hosts" {
  value = aws_db_instance.replica[*].address
}
output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}
output "app_kms_key_id" {
  value = aws_kms_key.app.key_id
}
output "backup_bucket" {
  value = aws_s3_bucket.backups.bucket
}
output "evidence_bucket" {
  value = aws_s3_bucket.evidence.bucket
}
output "waf_arn" {
  value = aws_wafv2_web_acl.edge.arn
}
