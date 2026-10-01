#!/usr/bin/env bash
# Deletes everything deploy.sh creates and verifies that nothing is left (spec B2 §4.3).
# Usage: npm run teardown -- --yes [--keep-data]
#   --keep-data keeps the table and the secrets (to redeploy without reseeding or reconfiguring the bridge).
set -euo pipefail

: "${AWS_PROFILE:?Set AWS_PROFILE and sign in with aws sso login}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""
# Git Bash would turn /ecs/counterpart into a Windows path.
export MSYS_NO_PATHCONV=1

APP=counterpart
TABLE=counterpart
LOG_GROUP=/ecs/counterpart
CLUSTER=default
YES=0; KEEP=0
for arg in "$@"; do
  case "$arg" in --yes) YES=1 ;; --keep-data) KEEP=1 ;; *) echo "Unknown option: $arg" >&2; exit 1 ;; esac
done
if [ "$YES" != 1 ]; then
  echo "This deletes the service, image, logs and roles of $APP$([ "$KEEP" = 1 ] || echo ', the table and the secrets'). Run it again with --yes." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$*"; }

ARN="$(aws ecs describe-services --cluster "$CLUSTER" --services "$APP" \
  --query "services[?status=='ACTIVE'].serviceArn | [0]" --output text 2>/dev/null || true)"
if [ -n "$ARN" ] && [ "$ARN" != "None" ]; then
  step "Express Mode service (and its load balancer)"
  aws ecs delete-express-gateway-service --service-arn "$ARN" >/dev/null
  aws ecs wait services-inactive --cluster "$CLUSTER" --services "$APP"
fi

step "ECR repository"
aws ecr delete-repository --repository-name "$APP" --force >/dev/null 2>&1 || true

step "Log group"
aws logs delete-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true

delete_role() {
  aws iam get-role --role-name "$1" >/dev/null 2>&1 || return 0
  for p in $(aws iam list-attached-role-policies --role-name "$1" --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$1" --policy-arn "$p"
  done
  for p in $(aws iam list-role-policies --role-name "$1" --query 'PolicyNames[]' --output text); do
    aws iam delete-role-policy --role-name "$1" --policy-name "$p"
  done
  aws iam delete-role --role-name "$1"
}

step "Task IAM roles"
delete_role "$APP-execution"
delete_role "$APP-task"

# Express Mode uses the infrastructure role to delete its load balancer and target groups, and does so
# after the service goes inactive. Deleting the role first could orphan the load balancer, still
# billing and with no role to delete it: wait up to 10 minutes for them to disappear.
step "Waiting for Express Mode to delete the load balancer"
for _ in $(seq 1 20); do
  LEFT_LB="$(aws elbv2 describe-load-balancers --query "LoadBalancers[?starts_with(LoadBalancerName, 'ecs-express-gateway')].LoadBalancerName | [0]" --output text)"
  LEFT_TG="$(aws elbv2 describe-target-groups --query "TargetGroups[?starts_with(TargetGroupName, 'ecs-gateway')].TargetGroupName | [0]" --output text)"
  if { [ -z "$LEFT_LB" ] || [ "$LEFT_LB" = "None" ]; } && { [ -z "$LEFT_TG" ] || [ "$LEFT_TG" = "None" ]; }; then break; fi
  sleep 30
done

step "Express Mode infrastructure role"
if { [ -z "$LEFT_LB" ] || [ "$LEFT_LB" = "None" ]; } && { [ -z "$LEFT_TG" ] || [ "$LEFT_TG" = "None" ]; }; then
  delete_role "$APP-infrastructure"
else
  echo "  Keeping $APP-infrastructure: the load balancer or its target groups are still there. Run the teardown again in a few minutes."
fi

if [ "$KEEP" != 1 ]; then
  step "Secrets counterpart/*"
  for s in $(aws secretsmanager list-secrets --filters Key=name,Values=counterpart/ --query 'SecretList[].Name' --output text); do
    aws secretsmanager delete-secret --secret-id "$s" --force-delete-without-recovery >/dev/null
  done
  step "Table $TABLE"
  if aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
    aws dynamodb delete-table --table-name "$TABLE" >/dev/null
    aws dynamodb wait table-not-exists --table-name "$TABLE"
  fi
fi

step "Verification"
LEFT=0
report() { if [ -n "$2" ] && [ "$2" != "None" ] && [ "$2" != "0" ]; then echo "LEFT $1: $2"; LEFT=1; else echo "ok   $1"; fi; }
report "service" "$(aws ecs describe-services --cluster "$CLUSTER" --services "$APP" --query "services[?status=='ACTIVE'].serviceName | [0]" --output text 2>/dev/null || true)"
report "ECR" "$(aws ecr describe-repositories --query "repositories[?repositoryName=='$APP'].repositoryName | [0]" --output text)"
report "logs" "$(aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --query 'logGroups[0].logGroupName' --output text)"
report "roles" "$(aws iam list-roles --query "Roles[?starts_with(RoleName, '$APP-')].RoleName | [0]" --output text)"
# The most expensive part: Express Mode deletes its load balancer when the last service using it is deleted.
report "load balancer" "$(aws elbv2 describe-load-balancers --query "LoadBalancers[?starts_with(LoadBalancerName, 'ecs-express-gateway')].LoadBalancerName | [0]" --output text)"
report "target groups" "$(aws elbv2 describe-target-groups --query "TargetGroups[?starts_with(TargetGroupName, 'ecs-gateway')].TargetGroupName | [0]" --output text)"
if [ "$KEEP" != 1 ]; then
  report "secrets" "$(aws secretsmanager list-secrets --filters Key=name,Values=counterpart/ --query 'SecretList[0].Name' --output text)"
  report "table" "$(aws dynamodb list-tables --query "TableNames[?@=='$TABLE'] | [0]" --output text)"
fi
echo
echo "The bridge stacks are torn down separately: in each clone, npm run destroy."
exit "$LEFT"
