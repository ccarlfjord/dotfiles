#!/bin/bash

battery_status=''

if [ -e /sys/class/power_supply/BAT0/status ]; then
	battery_status="󰁹$(cat /sys/class/power_supply/BAT0/status) "
fi

date_formatted=" $(date +'%a %H:%M:%S %d/%m/%Y') "
active_keyboard_layout=" $(swaymsg -t get_inputs | jq -r '.[0].xkb_active_layout_name') "
wifi_info="  $(nmcli -g NAME connection show  --active | grep -v lo || "N/A") "

echo "$date_formatted$battery_status$wifi_info$active_keyboard_layout"
