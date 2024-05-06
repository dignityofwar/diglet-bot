#!/bin/bash

mariadb-dump -h 10.0.5.2 -P 3307 -u root digletbot -p --databases digletbot > ~/dumps/diglet-bot/fulldump.sql
