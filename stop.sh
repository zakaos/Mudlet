#!/bin/bash
echo -e "\e[31m"
echo "=========================================================="
echo "  __  __  _    _  ____   _      _____ _______ "
echo " |  \/  || |  | ||  _ \ | |    |  ___|_   __|"
echo " | \  / || |  | || | | || |    |  _|   | |   "
echo " | |\/| || |__| || |_| || |___ | |___  | |   "
echo " |_|  |_| \____/ |____/ |_____||_____| |_|   "
echo "                                             "
echo "      The codebase has been deployed...      "
echo "            The server is down.              "
echo "=========================================================="
echo -e "\e[0m"

echo "Stopping Mudlet server..."
pkill -f "node src/server.js"
if [ $? -eq 0 ]; then
    echo "Server stopped successfully."
else
    echo "Server was not running or could not be stopped."
fi
