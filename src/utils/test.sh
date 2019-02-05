report_location=$2/$(date +"%FT%H%M%S+0000")

mkdir -p $report_location

echo "$1 $3" > $report_location/test.txt 2>&1

echo "Finished getting data for: $1"

exit 0

