$json = Get-Content 'c:\Users\admin\OneDrive\Documents\CaesarCodess\samsa\archieves\samsa_archive.json' -Raw | ConvertFrom-Json
$conv = $json.conversations[0]
$msgs = $conv.messages

# Show the two specific timestamps (07:41 PM and 11:33 PM IST = 14:11 and 17:03 UTC approximately)
# Timestamps 1776346023643 and 1776346102001
Write-Host "=== All fields on item_id 32767800484500050948158094170914816 ==="
$msg1 = $msgs | Where-Object { $_.item_id -eq "32767800484500050948158094170914816" }
$msg1 | ConvertTo-Json -Depth 10

Write-Host ""
Write-Host "=== All fields on item_id 32767801929956313415620274654543872 ==="
$msg2 = $msgs | Where-Object { $_.item_id -eq "32767801929956313415620274654543872" }
$msg2 | ConvertTo-Json -Depth 10

Write-Host ""
Write-Host "=== media_urls top level sample ==="
$json.media_urls | Select-Object -First 5 | ConvertTo-Json -Depth 5
