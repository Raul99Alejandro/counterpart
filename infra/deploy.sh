#!/usr/bin/env bash
# Despliega Counterpart en ECS Express Mode (spec B2 §4.3). Idempotente: correrlo dos veces no duplica nada.
# Requiere AWS_PROFILE con sesión activa, Docker corriendo y el AWS CLI v2.
set -euo pipefail

: "${AWS_PROFILE:?Define AWS_PROFILE (por ejemplo, counterpart) y abre sesión con aws sso login}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""
# Git Bash convierte los argumentos que parecen rutas (/ecs/counterpart) en rutas de Windows. Se apaga,
# y las rutas locales van en formato D:/..., que entienden bash, aws, docker y git por igual.
export MSYS_NO_PATHCONV=1
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

APP=counterpart
TABLE=counterpart
LOG_GROUP=/ecs/counterpart
CLUSTER=default
HERE="$(native "$(cd "$(dirname "$0")" && pwd)")"
ROOT="$(native "$(cd "$HERE/.." && pwd)")"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE_REPO="$REGISTRY/$APP"
TAG="$(git -C "$ROOT" rev-parse --short HEAD)"
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then TAG="$TAG-dirty"; fi

step() { printf '\n==> %s\n' "$*"; }

step "ECS: cluster $CLUSTER"
# Una cuenta nueva puede no tenerlo. create-cluster sobre uno existente lo devuelve sin cambios; un cluster no cuesta.
aws ecs create-cluster --cluster-name "$CLUSTER" >/dev/null

step "ECR: repositorio $APP"
aws ecr describe-repositories --repository-names "$APP" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$APP" --image-scanning-configuration scanOnPush=true >/dev/null

step "DynamoDB: tabla $TABLE"
if ! aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name "$TABLE" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE"
fi
TTL_STATUS="$(aws dynamodb describe-time-to-live --table-name "$TABLE" --query TimeToLiveDescription.TimeToLiveStatus --output text)"
if [ "$TTL_STATUS" = "DISABLED" ]; then
  aws dynamodb update-time-to-live --table-name "$TABLE" --time-to-live-specification Enabled=true,AttributeName=expiresAt >/dev/null
fi

step "CloudWatch Logs: $LOG_GROUP, 14 días"
aws logs create-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 14

ensure_role() { # nombre, archivo de confianza
  aws iam get-role --role-name "$1" >/dev/null 2>&1 \
    || aws iam create-role --role-name "$1" --assume-role-policy-document "file://$HERE/iam/$2" >/dev/null
}

step "IAM: roles"
ensure_role "$APP-execution" ecs-tasks-trust.json
aws iam attach-role-policy --role-name "$APP-execution" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
ensure_role "$APP-task" ecs-tasks-trust.json
POLICY_FILE="$(native "$(mktemp)")"
sed -e "s/__ACCOUNT__/$ACCOUNT/g" -e "s/__REGION__/$AWS_REGION/g" "$HERE/iam/task-policy.json" > "$POLICY_FILE"
aws iam put-role-policy --role-name "$APP-task" --policy-name "$APP-task" --policy-document "file://$POLICY_FILE"
rm -f "$POLICY_FILE"
ensure_role "$APP-infrastructure" ecs-trust.json
# El CLI aplica --query página por página: sale un "None" por cada página sin coincidencia.
INFRA_POLICY="$(aws iam list-policies --scope AWS \
  --query "Policies[?contains(PolicyName, 'ExpressGateway')].Arn" --output text | tr '\t' '\n' | grep '^arn:' | head -1 || true)"
if [ -z "$INFRA_POLICY" ]; then
  echo "No encontré la política administrada de Express Mode (nombre con 'ExpressGateway')." >&2; exit 1
fi
aws iam attach-role-policy --role-name "$APP-infrastructure" --policy-arn "$INFRA_POLICY"
ROLE_ARN() { aws iam get-role --role-name "$1" --query Role.Arn --output text; }
EXECUTION_ARN="$(ROLE_ARN "$APP-execution")"
TASK_ARN="$(ROLE_ARN "$APP-task")"
INFRA_ARN="$(ROLE_ARN "$APP-infrastructure")"
sleep 10 # IAM tarda unos segundos en propagar un rol recién creado

step "Imagen: $APP:$TAG"
aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
docker build --platform linux/amd64 -t "$IMAGE_REPO:$TAG" "$ROOT"
docker push "$IMAGE_REPO:$TAG" >/dev/null

container_json() { # hosts permitidos
  cat <<JSON
{
  "image": "$IMAGE_REPO:$TAG",
  "containerPort": 3000,
  "awsLogsConfiguration": { "logGroup": "$LOG_GROUP", "logStreamPrefix": "$APP" },
  "environment": [
    { "name": "COUNTERPART_STORE", "value": "dynamo" },
    { "name": "DYNAMODB_TABLE", "value": "$TABLE" },
    { "name": "AWS_REGION", "value": "$AWS_REGION" },
    { "name": "COUNTERPART_ALLOWED_HOSTS", "value": "$1" }
  ]
}
JSON
}

service_arn() {
  aws ecs describe-services --cluster "$CLUSTER" --services "$APP" \
    --query "services[?status=='ACTIVE'].serviceArn | [0]" --output text 2>/dev/null || true
}

endpoint_host() {
  aws ecs describe-express-gateway-service --service-arn "$1" \
    --query "service.activeConfigurations[0].ingressPaths[?accessType=='PUBLIC'].endpoint | [0]" --output text \
    | sed -e 's#^https\?://##' -e 's#/.*$##'
}

ARN="$(service_arn)"
if [ -z "$ARN" ] || [ "$ARN" = "None" ]; then
  step "ECS Express Mode: crear el servicio (primera vez, /mcp cerrado hasta conocer el hostname)"
  ARN="$(aws ecs create-express-gateway-service \
    --service-name "$APP" --cluster "$CLUSTER" \
    --execution-role-arn "$EXECUTION_ARN" --task-role-arn "$TASK_ARN" --infrastructure-role-arn "$INFRA_ARN" \
    --health-check-path /ping --cpu 256 --memory 512 --cpu-architecture X86_64 \
    --scaling-target minTaskCount=1,maxTaskCount=1 \
    --primary-container "$(container_json bootstrap)" \
    --query service.serviceArn --output text)"
  aws ecs wait services-stable --cluster "$CLUSTER" --services "$APP"
fi

HOST="$(endpoint_host "$ARN")"
if [ -z "$HOST" ] || [ "$HOST" = "None" ]; then echo "El servicio no reporta endpoint público todavía." >&2; exit 1; fi

step "ECS Express Mode: imagen $TAG con Host permitido $HOST"
aws ecs update-express-gateway-service --service-arn "$ARN" \
  --execution-role-arn "$EXECUTION_ARN" --task-role-arn "$TASK_ARN" \
  --health-check-path /ping --cpu 256 --memory 512 --cpu-architecture X86_64 \
  --scaling-target minTaskCount=1,maxTaskCount=1 \
  --primary-container "$(container_json "$HOST")" >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$APP"

step "Listo"
echo "https://$HOST/mcp"
