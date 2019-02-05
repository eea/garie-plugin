#!/usr/bin/env bash
echo "Start getting data"

echo "Getting data for: $1"

echo "Recursion depth: $3"

report_location=$2/$(date +"%FT%H%M%S+0000")

mkdir -p $report_location

docker run --rm <my_docker_to_run> $1 $3 > $report_location/<my_garie_plugin>.txt 2>&1

echo "Finished getting data for: $1"

exit 0

