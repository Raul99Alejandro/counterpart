#!/usr/bin/env bash
# Borra todo lo que crea deploy.sh y verifica que no quedó nada (spec B2 §4.3).
# Uso: npm run teardown -- --yes [--keep-data]
#   --keep-data conserva la tabla y los secretos (para redesplegar sin resembrar ni reconfigurar el bridge).
set -euo pipefail

: "${AWS_PROFILE:?Define AWS_PROFILE y abre sesión con aws sso login}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""
# Git Bash convertiría /ecs/counterpart en una ruta de Windows.
export MSYS_NO_PATHCONV=1

APP=counterpart
TABLE=counterpart
LOG_GROUP=/ecs/counterpart
CLUSTER=default
YES=0; KEEP=0
for arg in "$@"; do
  case "$arg" in --yes) YES=1 ;; --keep-data) KEEP=1 ;; *) echo "Opción desconocida: $arg" >&2; exit 1 ;; esac
done
if [ "$YES" != 1 ]; then
  echo "Esto borra el servicio, la imagen, los logs y los roles de $APP$([ "$KEEP" = 1 ] || echo ', la tabla y los secretos'). Repite con --yes." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$*"; }

ARN="$(aws ecs describe-services --cluster "$CLUSTER" --services "$APP" \
  --query "services[?status=='ACTIVE'].serviceArn | [0]" --output text 2>/dev/null || true)"
if [ -n "$ARN" ] && [ "$ARN" != "None" ]; then
  step "Servicio de Express Mode (y su balanceador)"
  aws ecs delete-express-gateway-service --service-arn "$ARN" >/dev/null
  aws ecs wait services-inactive --cluster "$CLUSTER" --services "$APP"
fi

step "Repositorio de ECR"
aws ecr delete-repository --repository-name "$APP" --force >/dev/null 2>&1 || true

step "Grupo de logs"
aws logs delete-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true

step "Roles de IAM"
for role in "$APP-execution" "$APP-task" "$APP-infrastructure"; do
  aws iam get-role --role-name "$role" >/dev/null 2>&1 || continue
  for p in $(aws iam list-attached-role-policies --role-name "$role" --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$role" --policy-arn "$p"
  done
  for p in $(aws iam list-role-policies --role-name "$role" --query 'PolicyNames[]' --output text); do
    aws iam delete-role-policy --role-name "$role" --policy-name "$p"
  done
  aws iam delete-role --role-name "$role"
done

if [ "$KEEP" != 1 ]; then
  step "Secretos counterpart/*"
  for s in $(aws secretsmanager list-secrets --filters Key=name,Values=counterpart/ --query 'SecretList[].Name' --output text); do
    aws secretsmanager delete-secret --secret-id "$s" --force-delete-without-recovery >/dev/null
  done
  step "Tabla $TABLE"
  if aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
    aws dynamodb delete-table --table-name "$TABLE" >/dev/null
    aws dynamodb wait table-not-exists --table-name "$TABLE"
  fi
fi

step "Verificación"
LEFT=0
report() { if [ -n "$2" ] && [ "$2" != "None" ] && [ "$2" != "0" ]; then echo "QUEDA $1: $2"; LEFT=1; else echo "ok   $1"; fi; }
report "servicio" "$(aws ecs describe-services --cluster "$CLUSTER" --services "$APP" --query "services[?status=='ACTIVE'].serviceName | [0]" --output text 2>/dev/null || true)"
report "ECR" "$(aws ecr describe-repositories --query "repositories[?repositoryName=='$APP'].repositoryName | [0]" --output text)"
report "logs" "$(aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --query 'logGroups[0].logGroupName' --output text)"
report "roles" "$(aws iam list-roles --query "Roles[?starts_with(RoleName, '$APP-')].RoleName | [0]" --output text)"
# Lo que más cobra: Express Mode borra su balanceador al borrar el último servicio que lo usa.
report "balanceador" "$(aws elbv2 describe-load-balancers --query "LoadBalancers[?starts_with(LoadBalancerName, 'ecs-express-gateway')].LoadBalancerName | [0]" --output text)"
report "target groups" "$(aws elbv2 describe-target-groups --query "TargetGroups[?starts_with(TargetGroupName, 'ecs-gateway')].TargetGroupName | [0]" --output text)"
if [ "$KEEP" != 1 ]; then
  report "secretos" "$(aws secretsmanager list-secrets --filters Key=name,Values=counterpart/ --query 'SecretList[0].Name' --output text)"
  report "tabla" "$(aws dynamodb list-tables --query "TableNames[?@=='$TABLE'] | [0]" --output text)"
fi
echo
echo "Los stacks del bridge se bajan aparte: en cada clon, npm run destroy."
exit "$LEFT"
