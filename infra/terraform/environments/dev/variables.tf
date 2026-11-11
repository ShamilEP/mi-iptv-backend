variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "mi-iptv"
}

variable "cost_center" {
  type    = string
  default = "mi-iptv-mvp"
}

variable "vpc_cidr" {
  type    = string
  default = "10.10.0.0/16"
}

variable "app_port" {
  type    = number
  default = 3000
}
