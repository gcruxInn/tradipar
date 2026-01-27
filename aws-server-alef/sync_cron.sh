#!/bin/bash
# ================================================================
# Partner Sync Cron Script - Set and Forget
# ================================================================
# Configurar no crontab:
#   0 2 * * * /home/gcrux-api/htdocs/api.gcrux.com/aws-server-alef/sync_cron.sh
# ================================================================

LOG_DIR="/var/log/tradipar"
LOG_FILE="$LOG_DIR/partner_sync_$(date +%Y%m%d).log"
SCRIPT_DIR="/home/gcrux-api/htdocs/api.gcrux.com/aws-server-alef"

# Criar diretório de logs se não existir
mkdir -p $LOG_DIR

echo "========================================" >> $LOG_FILE
echo "Sync iniciado: $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
echo "========================================" >> $LOG_FILE

cd $SCRIPT_DIR

# Executar full sync com batch size 25 (evita timeout Cloudflare 524)
node full_sync_partners.js https://api.gcrux.com 25 >> $LOG_FILE 2>&1

EXIT_CODE=$?

echo "" >> $LOG_FILE
echo "Sync finalizado: $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
echo "Exit code: $EXIT_CODE" >> $LOG_FILE
echo "========================================" >> $LOG_FILE

# Limpar logs antigos (manter últimos 30 dias)
find $LOG_DIR -name "partner_sync_*.log" -mtime +30 -delete

exit $EXIT_CODE
