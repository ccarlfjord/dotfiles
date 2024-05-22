#!/bin/bash

battery_status=''

if [ -e /sys/class/power_supply/BAT0/status ]; then
	bat_now=$(cat /sys/class/power_supply/BAT0/energy_now)
	bat_full=$(cat /sys/class/power_supply/BAT0/energy_full)
	bat_percentage=$(bc <<< "100 * ${bat_now}/${bat_full}")
	battery_status="󰁹 ${bat_percentage}% - $(cat /sys/class/power_supply/BAT0/status) "
fi


date_formatted=" $(date +'%H:%M:%S %a %d/%m/%Y ') "
active_keyboard_layout=" $(swaymsg -t get_inputs | jq -r '.[0].xkb_active_layout_name') "
wifi_info="  $(nmcli -g NAME connection show  --active | grep -v lo -v docker0 || "N/A") "

echo "$date_formatted$battery_status$wifi_info$active_keyboard_layout"
