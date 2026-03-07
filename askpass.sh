#!/bin/sh
cat /home/rochagabriel/dev/tradipar/.env | grep GCRUX_API_SSH | cut -d '=' -f 2
