# staging environment. State in S3 with DynamoDB locking; apply via CI with an OIDC-assumed role.
terraform {
  backend "s3" {
    bucket         = "p2p-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "p2p-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  alias  = "home"
  region = "eu-central-1"
}

variable "admin_cidrs" {
  type = list(string)
}

# Home region: database primary.
module "home" {
  source        = "../../modules/platform"
  providers     = { aws = aws.home }
  env           = "staging"
  region        = "eu-central-1"
  primary       = true
  vpc_cidr      = "10.10.0.0/16"
  azs           = ["eu-central-1a", "eu-central-1b", "eu-central-1c"]
  admin_cidrs   = var.admin_cidrs
  db_instance   = "db.t4g.large"
  db_replicas   = 0
  redis_node    = "cache.t4g.small"
  eks_node_type = "m7g.large"
  eks_min       = 2
  eks_max       = 4
}
