# production environment. State in S3 with DynamoDB locking; apply via CI with an OIDC-assumed role.
terraform {
  backend "s3" {
    bucket         = "p2p-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "p2p-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  alias  = "home"
  region = "eu-central-1"
}
provider "aws" {
  alias  = "sa"
  region = "sa-east-1"
}
provider "aws" {
  alias  = "ap"
  region = "ap-southeast-1"
}

variable "admin_cidrs" {
  type = list(string)
}

# Home region: database primary.
module "home" {
  source    = "../../modules/platform"
  providers = { aws = aws.home }
  env       = "production"
  region    = "eu-central-1"
  primary   = true
  vpc_cidr  = "10.10.0.0/16"
  azs       = ["eu-central-1a", "eu-central-1b", "eu-central-1c"]
  admin_cidrs = var.admin_cidrs
  db_instance = "db.r7g.2xlarge"
  db_replicas = 1
  redis_node = "cache.r7g.large"
  eks_node_type = "m7g.xlarge"
  eks_min = 3
  eks_max = 20
}

# Additional regions: stateless app tier + regional read replicas and Redis.
module "sa" {
  source         = "../../modules/platform"
  providers      = { aws = aws.sa }
  env            = "production"
  region         = "sa-east-1"
  primary        = false
  primary_db_arn = module.home.db_primary_arn
  vpc_cidr       = "10.20.0.0/16"
  azs            = ["sa-east-1a", "sa-east-1b", "sa-east-1c"]
  admin_cidrs    = var.admin_cidrs
  db_instance    = "db.r7g.xlarge"
  db_replicas    = 1
  redis_node     = "cache.r7g.large"
  eks_node_type  = "m7g.xlarge"
  eks_min        = 2
  eks_max        = 12
}
module "ap" {
  source         = "../../modules/platform"
  providers      = { aws = aws.ap }
  env            = "production"
  region         = "ap-southeast-1"
  primary        = false
  primary_db_arn = module.home.db_primary_arn
  vpc_cidr       = "10.30.0.0/16"
  azs            = ["ap-southeast-1a", "ap-southeast-1b", "ap-southeast-1c"]
  admin_cidrs    = var.admin_cidrs
  db_instance    = "db.r7g.xlarge"
  db_replicas    = 1
  redis_node     = "cache.r7g.large"
  eks_node_type  = "m7g.xlarge"
  eks_min        = 2
  eks_max        = 12
}
