#!/bin/bash

# 如果命令以非零状态退出，则立即退出。
set -e

# 默认值
USE_WEBSERVER="true"
BACKEND_PORT="3001"
CLIENT_PORT="3002"
MAPBOX_TOKEN=""

# 帮助函数
show_help() {
  echo "用法: $0 <域名> [选项]"
  echo "示例: $0 myapp.example.com"
  echo "不使用web服务器的示例: $0 myapp.example.com --no-webserver"
  echo ""
  echo "选项:"
  echo "  --no-webserver          禁用内置的Caddy web服务器"
  echo "  --backend-port <端口>   设置后端的自定义主机端口（默认：3001）"
  echo "  --client-port <端口>    设置客户端的自定义主机端口（默认：3002）"
  echo "  --mapbox-token <令牌>   设置Mapbox API令牌（可选但推荐用于地图）"
  echo "  --help                  显示此帮助信息"
}

# 解析参数
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --no-webserver) 
      USE_WEBSERVER="false"
      shift
      ;;
    --backend-port)
      if [[ -z "$2" || "$2" =~ ^- ]]; then
        echo "错误: --backend-port 需要端口号"
        show_help
        exit 1
      fi
      BACKEND_PORT="$2"
      shift 2
      ;;
    --client-port)
      if [[ -z "$2" || "$2" =~ ^- ]]; then
        echo "错误: --client-port 需要端口号"
        show_help
        exit 1
      fi
      CLIENT_PORT="$2"
      shift 2
      ;;
    --mapbox-token)
      if [[ -z "$2" || "$2" =~ ^- ]]; then
        echo "错误: --mapbox-token 需要令牌值"
        show_help
        exit 1
      fi
      MAPBOX_TOKEN="$2"
      shift 2
      ;;
    --help)
      show_help
      exit 0
      ;;
    -*)
      echo "未知选项: $1"
      show_help
      exit 1
      ;;
    *)
      if [ -z "$DOMAIN_NAME" ]; then
        DOMAIN_NAME="$1"
      else
        echo "错误: 只能指定一个域名"
        show_help
        exit 1
      fi
      shift
      ;;
  esac
done

# 检查是否提供了域名参数
if [ -z "$DOMAIN_NAME" ]; then
  echo "错误: 域名是必需的"
  show_help
  exit 1
fi

BASE_URL="https://${DOMAIN_NAME}"

# 为BETTER_AUTH_SECRET生成安全的随机密钥
# 如果可用则使用OpenSSL，否则回退到/dev/urandom
if command -v openssl &> /dev/null; then
    BETTER_AUTH_SECRET=$(openssl rand -hex 32)
elif [ -e /dev/urandom ]; then
    BETTER_AUTH_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)
else
    echo "错误: 无法生成安全密钥。请安装openssl或确保/dev/urandom可用。" >&2
    exit 1
fi

# 创建或覆盖.env文件
echo "正在创建.env文件..."

# 开始构建包含必要变量的.env文件
cat > .env << EOL
# 由setup.sh配置的必要变量
DOMAIN_NAME=${DOMAIN_NAME}
BASE_URL=${BASE_URL}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
DISABLE_SIGNUP=false
EOL

# 如果提供了MAPBOX_TOKEN则添加
if [ -n "$MAPBOX_TOKEN" ]; then
  echo "MAPBOX_TOKEN=${MAPBOX_TOKEN}" >> .env
fi

# 仅当使用自定义端口或无web服务器时添加端口变量
if [ "$USE_WEBSERVER" = "false" ]; then
  # 当不使用内置web服务器时，将端口暴露给所有接口
  if [ "$BACKEND_PORT" != "3001" ] || [ "$CLIENT_PORT" != "3002" ]; then
    # 指定了自定义端口
    echo "HOST_BACKEND_PORT=\"${BACKEND_PORT}:3001\"" >> .env
    echo "HOST_CLIENT_PORT=\"${CLIENT_PORT}:3002\"" >> .env
  else
    # 默认端口，直接暴露它们
    echo "HOST_BACKEND_PORT=\"3001:3001\"" >> .env
    echo "HOST_CLIENT_PORT=\"3002:3002\"" >> .env
  fi
elif [ "$BACKEND_PORT" != "3001" ] || [ "$CLIENT_PORT" != "3002" ]; then
  # 使用web服务器但使用自定义端口 - 仅绑定到localhost
  echo "HOST_BACKEND_PORT=\"127.0.0.1:${BACKEND_PORT}:3001\"" >> .env
  echo "HOST_CLIENT_PORT=\"127.0.0.1:${CLIENT_PORT}:3002\"" >> .env
fi

# 仅当为false时添加USE_WEBSERVER（因为true是默认行为）
if [ "$USE_WEBSERVER" = "false" ]; then
  echo "USE_WEBSERVER=false" >> .env
fi

echo ".env文件已成功创建，域名为 ${DOMAIN_NAME}。"
if [ "$USE_WEBSERVER" = "false" ]; then
  echo "Caddy web服务器已禁用。您需要设置自己的web服务器。"
  if [ "$BACKEND_PORT" = "3001" ] && [ "$CLIENT_PORT" = "3002" ]; then
    echo "后端服务将在端口3001上可用，客户端在端口3002上可用。"
  else 
    echo "后端服务将在端口${BACKEND_PORT}上可用（映射到容器端口3001）"
    echo "客户端服务将在端口${CLIENT_PORT}上可用（映射到容器端口3002）"
  fi
fi

# 构建并启动Docker Compose堆栈
echo "正在构建和启动Docker服务..."
if [ "$USE_WEBSERVER" = "false" ]; then
  # 使用--no-webserver时不启动caddy服务
  docker compose up -d
else
  # 启动包括caddy在内的所有服务
  docker compose --profile with-webserver up -d
fi

echo "设置完成。服务正在后台启动。"
echo "您可以使用以下命令监控日志: docker compose logs -f"