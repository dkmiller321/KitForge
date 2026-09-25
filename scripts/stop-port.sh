#!/usr/bin/env bash
# Stops whatever process listens on the given port (Windows/Git Bash dev helper).
port="${1:-4317}"
for pid in $(netstat -ano | grep -E "[:.]${port}\s" | grep LISTENING | awk '{print $NF}' | sort -u); do
  taskkill //F //T //PID "$pid" >/dev/null 2>&1 && echo "stopped pid $pid on port $port"
done
