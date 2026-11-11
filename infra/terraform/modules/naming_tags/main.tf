# Pure tagging / naming helper module — no cloud resources.
# Downstream modules should pass output.tags into resource tags and use name_prefix.
terraform {
  required_version = ">= 1.5.0"
}
