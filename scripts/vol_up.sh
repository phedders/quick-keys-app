#!/bin/bash


SINK=$(pactl list short sinks | cut -f 2|tail -1)

pactl set-sink-volume ${SINK} +2% > /dev/null 2>&1
